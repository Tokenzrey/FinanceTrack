import { applyCorrections } from '@/shared/lib/scan-hints'
import type { Category } from '@/shared/types/domain'
import * as adminData from './admin-data'
import { batchToDTOs, collapseToSingle, renumber } from './draft'
import { replies } from './replies'
import { parseReviewCommand } from './review-commands'
import type { BotIncoming, BotReply, BotTxType, DraftBatch, DraftLine, ReviewCommand } from './types'

/**
 * The editable review loop. Every write the bot performs now passes through here, so
 * "confirm before recording" is a property of the system rather than of one code path.
 *
 * A draft is never dropped silently: only `batal` (or the 15-minute TTL) discards it.
 * The old flow abandoned a pending draft the moment any unrelated message arrived,
 * which quietly threw away a Gemini call the user had already waited for.
 */

const MAX_OPTIONS = 4

function eligibleCategories(type: BotTxType, categories: Category[]): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

function findLine(batch: DraftBatch, n: number): DraftLine | undefined {
  return batch.lines.find((l) => l.n === n)
}

function replaceLine(batch: DraftBatch, updated: DraftLine): DraftBatch {
  return { ...batch, lines: batch.lines.map((l) => (l.n === updated.n ? updated : l)) }
}

/** Changing a line's type invalidates its category: an income line may not sit in a
 *  spend category and vice versa. Options are re-scoped and the choice is cleared, so
 *  the user is asked again rather than left with a silently wrong pillar. */
function retypeLine(line: DraftLine, type: BotTxType, categories: Category[]): DraftLine {
  const eligible = eligibleCategories(type, categories)
  const stillValid = line.categoryId ? eligible.find((c) => c.id === line.categoryId) : undefined
  return {
    ...line,
    type,
    categoryId: stillValid?.id ?? null,
    categoryName: stillValid?.name ?? null,
    options: eligible.slice(0, MAX_OPTIONS).map((c) => ({ categoryId: c.id, name: c.name })),
  }
}

async function persistAndRender(userId: string, batch: DraftBatch): Promise<BotReply> {
  await adminData.setPending(userId, batch)
  const tz = await adminData.getUserTimezone(userId)
  return replies.batchReview(batch, tz)
}

/** Re-renders the card for the current draft without changing it. */
export async function startReview(userId: string, batch: DraftBatch): Promise<BotReply> {
  return persistAndRender(userId, batch)
}

async function commit(userId: string, batch: DraftBatch, categories: Category[]): Promise<BotReply> {
  // ── Checks that must leave the draft intact when they reject — run on the passed-in
  //    batch, BEFORE the atomic claim. Only claim once we know we are going to write.
  const blocking = batch.lines.filter((l) => l.categoryId === null).map((l) => l.n)
  if (blocking.length > 0) return replies.reviewNeedsCategory(blocking)

  const dtos = batchToDTOs(batch, categories)
  if (dtos.length === 0) {
    await adminData.clearPending(userId)
    return replies.batchEmpty()
  }

  // Month lock is checked per distinct month the batch touches — a batch can straddle
  // a boundary once the user has edited dates.
  const months = new Map<string, Date>()
  for (const dto of dtos) {
    months.set(`${dto.date.getFullYear()}-${dto.date.getMonth() + 1}`, dto.date)
  }
  for (const date of months.values()) {
    const budget = await adminData.getMonthlyBudget(userId, date.getFullYear(), date.getMonth() + 1)
    if (adminData.isBudgetClosedAdmin(budget)) {
      return replies.monthClosed(date.getFullYear(), date.getMonth() + 1)
    }
  }

  // ── Atomic claim: whoever deletes the pending doc first owns the write. A second
  //    concurrent `ok`/Simpan-tap, or a retry after `rememberLastBatch`/hint-learning
  //    threw, finds nothing here and is told it was already handled — the batch is
  //    never written twice. This replaces the old trailing `clearPending`.
  const claimed = await adminData.claimPendingForCommit(userId)
  if (!claimed || claimed.pendingKind !== 'transaction_batch') return replies.batchAlreadyHandled()

  const ids = await adminData.createTransactionsBatch(userId, batchToDTOs(claimed, categories))
  await adminData.rememberLastBatch(userId, ids)

  // Learning loop: every confirmed line teaches the local resolver, so the next
  // "kopi 20rb" needs no model at all. A failure here must never cost the user their
  // transactions — those are already written.
  try {
    const corrections = claimed.lines
      .filter((l) => l.categoryId && l.description)
      .map((l) => ({ itemName: l.description as string, categoryId: l.categoryId as string }))
    if (corrections.length > 0) {
      const existing = await adminData.getScanHints(userId)
      await adminData.saveScanHints(userId, applyCorrections(existing, corrections))
    }
  } catch (error) {
    console.error('bot hint learning error (transactions already saved):', error)
  }

  const tz = await adminData.getUserTimezone(userId)
  // Confirmation names what was actually written: for `single` that is the collapsed
  // line (heaviest line's category), the same source `batchToDTOs` used — not `lines[0]`.
  const savedLines = claimed.mode === 'single' ? [collapseToSingle(claimed)] : claimed.lines
  const receiptStatus = claimed.receipt ? 'saved' : claimed.source === 'receipt' ? 'drive_not_linked' : 'none'
  return replies.batchSaved(savedLines, claimed.mode, tz, receiptStatus)
}

async function applyCommand(
  userId: string,
  batch: DraftBatch,
  cmd: ReviewCommand,
  categories: Category[],
): Promise<BotReply> {
  const max = batch.lines.length

  switch (cmd.kind) {
    case 'save':
      return commit(userId, batch, categories)

    case 'cancel':
      await adminData.clearPending(userId)
      return replies.batchCancelled(batch.lines.length)

    case 'help':
      return replies.reviewHelp()

    case 'set_mode': {
      if (cmd.mode === 'single') {
        // The Telegram merge button is gated to `source === 'receipt'` in
        // `replies.batchReview`; the typed `gabung` command must match it, or a text
        // batch silently loses its per-line itemisation.
        if (batch.source !== 'receipt') return replies.reviewMergeReceiptOnly()
        // `collapseToSingle` sums `amount` across every line regardless of `type`, so a
        // mixed income+expense batch would collapse into one wrong-signed transaction.
        if (new Set(batch.lines.map((l) => l.type)).size > 1) return replies.reviewMixedTypesMerge()
      }
      return persistAndRender(userId, { ...batch, mode: cmd.mode })
    }

    case 'focus': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      const tz = await adminData.getUserTimezone(userId)
      return replies.reviewLineFocus(line, tz)
    }

    case 'remove': {
      if (!findLine(batch, cmd.n)) return replies.reviewInvalidLine(cmd.n, max)
      const lines = renumber(batch.lines.filter((l) => l.n !== cmd.n))
      if (lines.length === 0) {
        await adminData.clearPending(userId)
        return replies.batchEmpty()
      }
      return persistAndRender(userId, { ...batch, lines })
    }

    case 'set_category': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      const option = line.options[cmd.option - 1]
      if (!option) return replies.reviewInvalidLine(cmd.option, line.options.length)
      // `line.options` was persisted when the card was rendered; a category deleted
      // since then would otherwise be written as a dangling `categoryId`.
      if (!categories.some((c) => c.id === option.categoryId && c.isActive)) {
        return replies.reviewCategoryGone()
      }
      return persistAndRender(
        userId,
        replaceLine(batch, { ...line, categoryId: option.categoryId, categoryName: option.name }),
      )
    }

    case 'set_amount': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, amount: cmd.amount }))
    }

    case 'set_description': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, description: cmd.text }))
    }

    case 'set_date': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, dateIso: cmd.date.toISOString() }))
    }

    case 'set_type': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, retypeLine(line, cmd.type, categories)))
    }

    default:
      return replies.reviewUnknownCommand(batch.lines.length)
  }
}

export async function handleReviewMessage(
  userId: string,
  batch: DraftBatch,
  msg: BotIncoming,
): Promise<BotReply> {
  // A photo mid-review is almost always the *next* receipt, not a correction. Saying so
  // beats silently discarding the batch the user is halfway through checking.
  if (msg.kind !== 'text') return replies.busyReviewing(batch.lines.length)

  const cmd = parseReviewCommand(msg.text, new Date())
  if (cmd.kind === 'none') return replies.reviewUnknownCommand(batch.lines.length)

  const categories = await adminData.findCategories(userId)
  return applyCommand(userId, batch, cmd, categories)
}
