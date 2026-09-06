import {
  ALLOWED_MIME,
  MAX_BASE64_CHARS,
  extractReceipt,
  isAiQuotaOrOverloadError,
} from '@/shared/lib/receipt-extraction'
import type { Category } from '@/shared/types/domain'
import * as adminData from './admin-data'
import { batchToDTOs, buildLinesFromParsed, buildLinesFromReceipt, renumber } from './draft'
import { uploadReceiptForUser } from './drive-upload'
import { startReview } from './flow-review'
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
 */

/** Above this the model's top category guess is taken without asking. Unchanged from
 *  the previous single-transaction flow. */
const AUTO_ACCEPT_CONFIDENCE = 60

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
  const categories = await adminData.findCategories(userId)
  const active = categories.filter((c) => c.isActive)

  const parsed = await parseTransactionBatch(text, active)
  const lines = buildLinesFromParsed(parsed, active, new Date())

  // Every segment failed to yield an amount — the message simply has no number in it.
  if (lines.length === 0) return replies.amountNotFound()

  const topConfidence = parsed[0]?.confidence ?? 0
  if (isFastPath(lines) && topConfidence >= AUTO_ACCEPT_CONFIDENCE) {
    return commitDirect(userId, newBatch({ source: 'text', lines }), categories)
  }

  return startReview(userId, newBatch({ source: 'text', lines }))
}

export async function handlePhoto(
  userId: string,
  msg: Extract<BotIncoming, { kind: 'image' }>,
): Promise<BotReply> {
  if (msg.imageBase64.length > MAX_BASE64_CHARS) return replies.imageTooLarge()
  if (!ALLOWED_MIME.includes(msg.mimeType)) return replies.notAReceipt()

  const categories = await adminData.findCategories(userId)
  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  let result
  try {
    // The caption is extra extraction context: on a blurry or long itemised receipt
    // "yang buram itu teh botol 2x12rb" recovers lines OCR drops. Also still feeds the
    // fallback line's description below.
    result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      [],
      msg.caption,
    )
  } catch (error) {
    console.error('bot handlePhoto extractReceipt error:', error)
    if (isAiQuotaOrOverloadError(error)) return replies.aiUnavailable()
    return replies.genericError()
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
        options: spendCategories.slice(0, 4).map((c) => ({ categoryId: c.id, name: c.name })),
      },
    ])
  }

  const uploaded = await uploadReceiptForUser(
    userId,
    base64ToBlob(msg.imageBase64, msg.mimeType),
    `struk-${Date.now()}.jpg`,
  )

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
