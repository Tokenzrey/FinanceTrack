import { createHash } from 'node:crypto'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'

/**
 * Cache keys for model results.
 *
 * The same photo arriving twice is routine, not exotic: GOWA retries a webhook it
 * thinks failed, and a user who saw no reply for twenty seconds sends the receipt
 * again. Each of those repeats used to cost two calls out of a twenty-a-day budget.
 */

export function hashImage(base64: string): string {
  return createHash('sha256').update(base64).digest('hex')
}

/**
 * Text parses are cached against the category set as well as the message: the model's
 * answer names category ids, so adding, deleting, or re-scoping a category makes every
 * earlier answer stale.
 */
export function hashParse(text: string, categoryIds: string[]): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const categories = [...categoryIds].sort().join(',')
  return createHash('sha256').update(`${normalized}␟${categories}`).digest('hex')
}

/** `rawText` is the full OCR dump — easily 50-100 KB, and useless once the items are
 *  extracted. Everything else in a scan result is small. */
export function stripForCache(result: ReceiptScanResult): ReceiptScanResult {
  return { ...result, extraction: { ...result.extraction, rawText: '' } }
}
