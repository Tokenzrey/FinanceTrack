import { buildMonthlySummary } from '@/shared/lib/budget-math'
import { ALLOWED_MIME, MAX_BASE64_CHARS, extractReceipt } from '@/shared/lib/receipt-extraction'
import { DEFAULT_PILLAR_CONFIG, type Category } from '@/shared/types/domain'
import type { MappedReceiptItem } from '@/shared/types/receipt-scanner.types'
import * as adminData from './admin-data'
import type { BotPendingDraft } from './admin-data'
import { uploadReceiptForUser } from './drive-upload'
import { parseAmount } from './parse-amount'
import { matchReadCommand, parseIntent } from './parse-intent'
import { replies } from './replies'
import type { BotIncoming, BotIntent, BotReply } from './types'

/**
 * The platform-agnostic heart of the bot. `handleIncoming` is the only export the
 * webhook adapters call — everything else here is private orchestration. No
 * `file_id`, `media id`, or platform-specific payload shape crosses into this file;
 * the adapters normalize all of that into `BotIncoming` first (see `types.ts`).
 */

/** A category candidate is auto-accepted without asking at or above this confidence;
 *  below it, the user is asked to pick from the candidates instead. */
const AUTO_ACCEPT_CONFIDENCE = 60

const LINK_CODE_RE = /^[A-Z2-9]{6}$/

interface Draft {
  amount: number
  description: string | null
  dateIso: string
}

export async function handleIncoming(msg: BotIncoming): Promise<BotReply> {
  const link = await adminData.findLinkByExternalId(msg.platform, msg.externalId)

  if (!link) {
    // An unlinked chat can only meaningfully do one thing: submit a link code.
    if (msg.kind === 'text' && LINK_CODE_RE.test(msg.text.trim().toUpperCase())) {
      const result = await adminData.consumeLinkCode(msg.text, msg.platform, msg.externalId, null)
      return result.ok ? { text: replies.linkSuccess() } : { text: replies.linkCodeInvalid(result.error) }
    }
    return { text: replies.notLinked() }
  }

  const userId = link.userId

  // A pending category confirmation takes priority over everything else.
  const pending = await adminData.getPending(userId)
  if (pending) return handlePendingReply(userId, pending, msg)

  if (msg.kind === 'image') return handleImage(userId, msg)
  return handleText(userId, msg.text)
}

// ─── Pending confirmation ────────────────────────────────────────

async function handlePendingReply(
  userId: string,
  pending: BotPendingDraft,
  msg: BotIncoming,
): Promise<BotReply> {
  if (msg.kind !== 'text') {
    // A photo arrives while something else is pending — the stale draft is dropped
    // silently and the photo is processed fresh, rather than leaving the user stuck
    // answering a question about a different transaction.
    await adminData.clearPending(userId)
    return handleImage(userId, msg)
  }

  const trimmed = msg.text.trim()
  if (/^batal$/i.test(trimmed)) {
    await adminData.clearPending(userId)
    return { text: replies.pendingCancelled() }
  }

  if (/^\d+$/.test(trimmed)) {
    const choice = Number(trimmed)
    if (choice >= 1 && choice <= pending.options.length) {
      const category = pending.options[choice - 1]
      await adminData.clearPending(userId)
      return finalizeTransaction(userId, pending.draft, category, pending.receipt)
    }
    // A number, but out of range — almost certainly a mistyped answer, not a new
    // message. Keep the draft alive and ask again instead of discarding it.
    return { text: replies.invalidCategoryChoice(pending.options.length) }
  }

  // Anything else is a fresh message — the draft is abandoned silently, exactly as
  // the plan specifies, and the new message is processed as if nothing was pending.
  await adminData.clearPending(userId)
  return handleText(userId, msg.text)
}

// ─── Text messages ───────────────────────────────────────────────

async function handleText(userId: string, text: string): Promise<BotReply> {
  const trimmed = text.trim()
  if (!trimmed) return { text: replies.unknownMessage() }

  const readCommand = matchReadCommand(trimmed)
  if (readCommand) return handleReadCommand(userId, readCommand)

  // Nominal is checked before ever calling Gemini — no point spending a model call on
  // a message that has no parsable amount at all.
  const amount = parseAmount(trimmed)
  if (amount === null) return { text: replies.amountNotFound() }

  const categories = await adminData.findCategories(userId)
  const active = categories.filter((c) => c.isActive)

  const parsed = await parseIntent(trimmed, active)

  // Code-level backstop for the prompt's income/expense category rule — a category
  // pillar is never trusted from the model's word alone. Business rules like "pillar
  // follows category" stay enforced here even if the model ever ignores the prompt.
  const relevantCategories = active.filter((c) =>
    parsed.intent === 'add_income' ? c.pillar === 'income' : c.pillar !== 'income',
  )

  const date = new Date()
  date.setDate(date.getDate() + parsed.dateOffset)
  const draft: Draft = { amount, description: parsed.description, dateIso: date.toISOString() }

  return resolveCategoryOrAsk(userId, draft, parsed.categoryCandidates, parsed.confidence, relevantCategories)
}

async function handleReadCommand(userId: string, intent: BotIntent): Promise<BotReply> {
  if (intent === 'help') return { text: replies.help() }

  if (intent === 'list_categories') {
    const categories = await adminData.findCategories(userId)
    return { text: replies.categoryList(categories.filter((c) => c.isActive && c.pillar !== 'income')) }
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [categories, budget, transactions] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  return intent === 'get_summary' ? { text: replies.summary(summary) } : { text: replies.balance(summary) }
}

// ─── Photo messages ──────────────────────────────────────────────

function base64ToBlob(base64: string, mimeType: string): Blob {
  return new Blob([Buffer.from(base64, 'base64')], { type: mimeType })
}

/** Rolls a receipt's per-item category suggestions up into one ranked list for the
 *  whole receipt — weighted by item price, so a Rp2.000 snack doesn't outrank a
 *  Rp180.000 grocery haul just because more items happened to match it. */
function rankCandidateCategories(items: MappedReceiptItem[], categories: Category[]): string[] {
  const validIds = new Set(categories.map((c) => c.id))
  const weight = new Map<string, number>()
  for (const item of items) {
    if (!item.suggestedCategoryId || !validIds.has(item.suggestedCategoryId)) continue
    weight.set(item.suggestedCategoryId, (weight.get(item.suggestedCategoryId) ?? 0) + item.totalPrice)
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 3)
}

/** Weighted-average mapping confidence of the items that landed on `categoryId`. */
function candidateConfidence(items: MappedReceiptItem[], categoryId: string | undefined): number {
  if (!categoryId) return 0
  const relevant = items.filter((i) => i.suggestedCategoryId === categoryId)
  const totalWeight = relevant.reduce((sum, i) => sum + i.totalPrice, 0)
  if (totalWeight === 0) return 0
  return relevant.reduce((sum, i) => sum + i.mappingConfidence * i.totalPrice, 0) / totalWeight
}

async function handleImage(
  userId: string,
  msg: Extract<BotIncoming, { kind: 'image' }>,
): Promise<BotReply> {
  if (msg.imageBase64.length > MAX_BASE64_CHARS) return { text: replies.imageTooLarge() }
  if (!ALLOWED_MIME.includes(msg.mimeType)) return { text: replies.notAReceipt() }

  const categories = await adminData.findCategories(userId)
  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  let result
  try {
    result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      [],
    )
  } catch (error) {
    console.error('bot handleImage extractReceipt error:', error)
    return { text: replies.genericError() }
  }

  // Same threshold the web scanner uses to flag "this probably isn't a receipt".
  if (result.totalConfidence < 20 || result.extraction.total <= 0) {
    return { text: replies.notAReceipt() }
  }

  const amount = Math.round(result.extraction.total)
  const description = result.extraction.merchant ?? msg.caption ?? null
  const draft: Draft = { amount, description, dateIso: new Date().toISOString() }

  const candidateIds = rankCandidateCategories(result.mappedItems, spendCategories)
  const confidence = candidateConfidence(result.mappedItems, candidateIds[0])

  const uploaded = await uploadReceiptForUser(
    userId,
    base64ToBlob(msg.imageBase64, msg.mimeType),
    `struk-${Date.now()}.jpg`,
  )

  return resolveCategoryOrAsk(
    userId,
    draft,
    candidateIds,
    confidence,
    spendCategories,
    uploaded ?? undefined,
    /* imageWithoutReceipt */ uploaded === null,
  )
}

// ─── Shared: category resolution → confirm or record ────────────

async function resolveCategoryOrAsk(
  userId: string,
  draft: Draft,
  candidateIds: string[],
  confidence: number,
  categories: Category[],
  receipt?: { gDriveFileId: string; gDriveWebViewLink: string },
  imageWithoutReceipt = false,
): Promise<BotReply> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const validCandidates = candidateIds.filter((id) => byId.has(id))

  if (confidence >= AUTO_ACCEPT_CONFIDENCE && validCandidates[0]) {
    const category = byId.get(validCandidates[0])!
    return finalizeTransaction(
      userId,
      draft,
      { categoryId: category.id, name: category.name },
      receipt,
      imageWithoutReceipt,
    )
  }

  // Not confident — offer up to 3 candidates, falling back to the first few active
  // categories if nothing plausible was found at all, so there's always something to
  // pick from rather than a dead end.
  const options =
    validCandidates.length > 0
      ? validCandidates.map((id) => ({ categoryId: id, name: byId.get(id)!.name }))
      : categories.slice(0, 3).map((c) => ({ categoryId: c.id, name: c.name }))

  if (options.length === 0) return { text: replies.categoryList([]) }

  await adminData.setPending(userId, { draft, options, receipt })
  return { text: replies.categoryConfirmPrompt(draft.amount, draft.description, options) }
}

async function finalizeTransaction(
  userId: string,
  draft: Draft,
  category: { categoryId: string; name: string },
  receipt: { gDriveFileId: string; gDriveWebViewLink: string } | undefined,
  imageWithoutReceipt = false,
): Promise<BotReply> {
  const date = new Date(draft.dateIso)
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const budget = await adminData.getMonthlyBudget(userId, year, month)
  if (adminData.isBudgetClosedAdmin(budget)) {
    return { text: replies.monthClosed(year, month) }
  }

  const categories = await adminData.findCategories(userId)
  const fullCategory = categories.find((c) => c.id === category.categoryId)
  if (!fullCategory) return { text: replies.genericError() }

  if (draft.amount <= 0) return { text: replies.amountNotFound() }

  await adminData.createTransaction(userId, {
    date,
    type: fullCategory.pillar === 'income' ? 'income' : 'expense',
    pillar: fullCategory.pillar,
    categoryId: fullCategory.id,
    amount: draft.amount,
    description: draft.description ?? undefined,
    tags: ['bot'],
    gDriveFileId: receipt?.gDriveFileId,
    gDriveWebViewLink: receipt?.gDriveWebViewLink,
  })

  const receiptStatus = receipt ? 'saved' : imageWithoutReceipt ? 'drive_not_linked' : 'none'
  return { text: replies.transactionRecorded(draft.amount, fullCategory.name, receiptStatus) }
}
