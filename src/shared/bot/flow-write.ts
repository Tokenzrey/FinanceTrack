import {
  ALLOWED_MIME,
  MAX_BASE64_CHARS,
  extractReceipt,
  isAiQuotaOrOverloadError,
} from '@/shared/lib/receipt-extraction'
import type { Category } from '@/shared/types/domain'
import type { CategoryHint, ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import * as adminData from './admin-data'
import { hashImage, hashParse, stripForCache } from './cache'
import { batchToDTOs, buildLinesFromParsed, buildLinesFromReceipt, renumber } from './draft'
import { uploadReceiptForUser } from './drive-upload'
import { startReview } from './flow-review'
import { tryLocalBatch } from './local-resolver'
import { parseAmount } from './parse-amount'
import { parseTransactionBatch } from './parse-batch'
import { replies } from './replies'
import type { BotIncoming, BotReply, DraftBatch, DraftLine } from './types'

/**
 * The write side: a chat message or a photo becomes a `DraftBatch`.
 *
 * A receipt ALWAYS opens the review card — the user asked for confirm-and-edit before
 * anything is recorded, and an OCR read of a crumpled photo is exactly the case where
 * that matters. A text message keeps the old one-step path, but only when it is
 * unambiguous: exactly one transaction, a confident category match. Anything else
 * (two transactions in one sentence, a shaky category guess) is worth one tap.
 *
 * Before the model is consulted at all, `tryLocalBatch` (L0) gets first refusal: a
 * phrase whose category the user has already confirmed resolves with no model call.
 */

function base64ToBlob(base64: string, mimeType: string): Blob {
  return new Blob([Buffer.from(base64, 'base64')], { type: mimeType })
}

function newBatch(over: Partial<DraftBatch> & Pick<DraftBatch, 'source' | 'lines'>): DraftBatch {
  return {
    pendingKind: 'transaction_batch',
    mode: 'itemized',
    merchant: null,
    receiptTotal: null,
    warnings: [],
    ...over,
  }
}

/** One line, confident, categorised — the case that should still feel instant. */
function isFastPath(lines: DraftLine[]): boolean {
  return lines.length === 1 && lines[0].categoryId !== null
}

async function commitDirect(
  userId: string,
  batch: DraftBatch,
  categories: Category[],
): Promise<BotReply> {
  const dtos = batchToDTOs(batch, categories)
  if (dtos.length === 0) return replies.amountNotFound()

  const date = dtos[0].date
  const budget = await adminData.getMonthlyBudget(userId, date.getFullYear(), date.getMonth() + 1)
  if (adminData.isBudgetClosedAdmin(budget)) {
    return replies.monthClosed(date.getFullYear(), date.getMonth() + 1)
  }

  const ids = await adminData.createTransactionsBatch(userId, dtos)
  await adminData.rememberLastBatch(userId, ids)

  const tz = await adminData.getUserTimezone(userId)
  return replies.transactionRecorded(dtos[0].amount, batch.lines[0].categoryName ?? '', 'none', date, tz)
}

export async function handleTextTransaction(userId: string, text: string): Promise<BotReply> {
  // One round trip for everything the decision needs.
  const [categories, hints, prefs] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getScanHints(userId),
    adminData.getBotPrefs(userId),
  ])
  const active = categories.filter((c) => c.isActive)
  const now = new Date()

  // L0 — no model call at all. Everything here came from the user's own confirmed
  // history, so it is simultaneously the fastest path and the most accurate one.
  const localLines = tryLocalBatch(text, active, hints, now)
  if (localLines) {
    const batch = newBatch({ source: 'text', lines: localLines })
    // Same gate as the L1 fast path below: the user's `/atur autoaccept` threshold
    // must apply to known phrases too, not just to model parses.
    if (
      localLines.length === 1 &&
      localLines[0].confidence >= prefs.autoAcceptConfidence &&
      !prefs.alwaysReview
    ) {
      return commitDirect(userId, batch, categories)
    }
    return startReview(userId, batch)
  }

  // A message with no parseable amount is never a transaction — refuse it here rather
  // than spend an L1 model call to be told the same thing. `parseAmount` returns
  // non-null for any batch with at least one amount, so real multi-transaction
  // messages are unaffected.
  if (parseAmount(text) === null) return replies.amountNotFound()

  // L0.5 — the same sentence, with the same categories, has the same answer.
  const parseKey = hashParse(text, active.map((c) => c.id))
  let parsed = await adminData.getCachedParse(userId, parseKey)
  if (!parsed) {
    // L1 — text tier (flash-lite): 500/day per model, and lower latency than flash.
    parsed = await parseTransactionBatch(text, active)
    // A fallback line means the model never actually answered; caching it would pin
    // the failure in place for 30 days.
    if (parsed.length > 0 && parsed[0].confidence > 0) {
      await adminData.saveCachedParse(userId, parseKey, parsed)
    }
  }
  const lines = buildLinesFromParsed(parsed, active, now)

  // Every segment failed to yield an amount — the message simply has no number in it.
  if (lines.length === 0) return replies.amountNotFound()

  // Read confidence off the built line, never `parsed[0]`: `buildLinesFromParsed`
  // drops unparseable segments, so `parsed[0]` can be a line that no longer exists.
  if (isFastPath(lines) && lines[0].confidence >= prefs.autoAcceptConfidence && !prefs.alwaysReview) {
    return commitDirect(userId, newBatch({ source: 'text', lines }), categories)
  }

  return startReview(userId, newBatch({ source: 'text', lines }))
}

type ReadOutcome =
  | { ok: true; result: ReceiptScanResult }
  | { ok: false; reply: BotReply }

/**
 * Just the vision extraction, wrapped in a discriminated result so it can sit inside a
 * `Promise.all` next to the Drive upload — a model failure comes back as `{ ok: false }`
 * with the reply to send, never a throw that would tear the other branch down. Cache
 * lookup and store are the caller's job (`handlePhoto`), since the cache row now also
 * carries the Drive upload and both are decided together.
 *
 * The caption is extra extraction context: on a blurry or long itemised receipt
 * "yang buram itu teh botol 2x12rb" recovers lines OCR drops.
 */
async function extractFresh(
  msg: Extract<BotIncoming, { kind: 'image' }>,
  spendCategories: Category[],
  hints: CategoryHint[],
): Promise<ReadOutcome> {
  try {
    const result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      hints,
      msg.caption,
    )
    return { ok: true, result }
  } catch (error) {
    console.error('bot readReceipt error:', error)
    return {
      ok: false,
      reply: isAiQuotaOrOverloadError(error) ? replies.aiUnavailable() : replies.genericError(),
    }
  }
}

export async function handlePhoto(
  userId: string,
  msg: Extract<BotIncoming, { kind: 'image' }>,
): Promise<BotReply> {
  if (msg.imageBase64.length > MAX_BASE64_CHARS) return replies.imageTooLarge()
  if (!ALLOWED_MIME.includes(msg.mimeType)) return replies.notAReceipt()

  const [categories, hints] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getScanHints(userId),
  ])
  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  // The same photo arriving twice is routine — GOWA retries, or the user re-sends after
  // seeing no reply. A cached read costs nothing from the vision budget.
  const imageKey = hashImage(msg.imageBase64)
  const cached = await adminData.getCachedReceipt(userId, imageKey)
  const uploadFresh = () =>
    uploadReceiptForUser(userId, base64ToBlob(msg.imageBase64, msg.mimeType), `struk-${Date.now()}.jpg`)

  let result: ReceiptScanResult
  let uploaded: { gDriveFileId: string; gDriveWebViewLink: string } | null

  if (cached) {
    // A cached read means this exact image was already processed — the Drive upload
    // ran then too. Reuse it instead of creating a duplicate file; only re-upload when
    // the cached entry predates upload-caching, or its upload had failed.
    result = cached.result
    uploaded = cached.receipt ?? (await uploadFresh())
    if (!cached.receipt && uploaded) {
      await adminData.saveCachedReceipt(userId, imageKey, cached.result, uploaded)
    }
  } else {
    // The Drive upload never depended on the extraction — it only needs the bytes,
    // already in hand. Running them in series wasted 2-5s on every receipt. Deliberate:
    // if the read then fails, the photo is already on Drive — acceptable.
    const [outcome, freshUpload] = await Promise.all([
      extractFresh(msg, spendCategories, hints),
      uploadFresh(),
    ])
    if (!outcome.ok) return outcome.reply
    result = outcome.result
    uploaded = freshUpload
    // Cache only a usable read — a "not a receipt" verdict on a bad angle must not
    // survive a re-take, and a quota error must not be pinned — together with the
    // upload so a re-send reuses the file.
    if (result.totalConfidence >= 20 && result.extraction.total > 0) {
      await adminData.saveCachedReceipt(userId, imageKey, stripForCache(result), uploaded ?? undefined)
    }
  }

  if (result.totalConfidence < 20 || result.extraction.total <= 0) return replies.notAReceipt()

  const now = new Date()
  let lines = buildLinesFromReceipt(result, categories, now)

  // The model read a total but no usable line items (common on a faded thermal print).
  // One line for the whole receipt is still worth confirming, and the user can split
  // it by hand from the card.
  if (lines.length === 0) {
    lines = renumber([
      {
        n: 0,
        type: 'expense',
        amount: Math.round(result.extraction.total),
        description: result.extraction.merchant ?? msg.caption ?? null,
        categoryId: null,
        categoryName: null,
        dateIso: now.toISOString(),
        confidence: result.totalConfidence,
        options: spendCategories.slice(0, 4).map((c) => ({ categoryId: c.id, name: c.name })),
      },
    ])
  }

  return startReview(
    userId,
    newBatch({
      source: 'receipt',
      lines,
      merchant: result.extraction.merchant,
      receiptTotal: Math.round(result.extraction.total),
      warnings: result.warnings,
      receipt: uploaded ?? undefined,
    }),
  )
}
