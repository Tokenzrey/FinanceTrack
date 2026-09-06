import { keywordFor } from '@/shared/lib/scan-hints'
import type { Category } from '@/shared/types/domain'
import type { CategoryHint } from '@/shared/types/receipt-scanner.types'
import { parseAmount } from './parse-amount'
import type { BotTxType, DraftLine, LocalMatch } from './types'

/**
 * The zero-call layer. Everything here runs locally in under a millisecond and costs
 * no quota at all.
 *
 * It works because the review card teaches it: every category the user confirms is
 * written back as a `CategoryHint` (see `flow-review`), into the same
 * `users/{uid}/meta/scan_hints` document the web scanner already learns into. After a
 * few days of ordinary use "kopi", "bensin" and "indomaret" are known, and the most
 * common message a finance bot ever receives stops needing a model at all — while
 * being MORE accurate than the model, because the answer came from the user.
 */

const CATEGORY_NAME_CONFIDENCE = 92
const CATEGORY_HEAD_CONFIDENCE = 86
const HINT_BASE_CONFIDENCE = 60
const HINT_MAX_CONFIDENCE = 95

/** Local resolution must clear this before the fast path may skip confirmation. */
export const LOCAL_ACCEPT_CONFIDENCE = 80

const INCOME_WORDS = /\b(gaji|gajian|masuk|bonus|thr|terima|diterima|refund|cashback|bunga|dividen)\b/i
const TRANSFER_WORDS = /\b(pindah|pindahin|transfer|tf|topup|top ?up|isi ?saldo|tarik ?tunai|setor ?tunai)\b/i

export function detectType(text: string): BotTxType | null {
  // Transfer is checked first: "transfer masuk" is a transfer, not income.
  if (TRANSFER_WORDS.test(text)) return 'transfer'
  if (INCOME_WORDS.test(text)) return 'income'
  return null
}

export function detectDateOffset(text: string): number {
  const lower = text.toLowerCase()
  if (/\bkemarin lusa\b/.test(lower)) return -2
  if (/\bkemarin\b/.test(lower)) return -1
  return 0
}

/**
 * Splits "makan 35rb, bensin 50rb dan kopi 20rb" into its parts.
 *
 * A "," or ";" is a real separator UNLESS it is a thousands/decimal mark — i.e. unless
 * it has a digit immediately on BOTH sides ("1,5jt", "1,250,000"). Only then is the
 * split suppressed; a digit merely abutting one side ("20000, teh 5000") is still a
 * boundary, so a plain-rupiah list no longer collapses into one segment. Dots are never
 * separators, so "1.500.000" is untouched regardless.
 */
const SEGMENT_SPLIT = /(?<!\d)\s*[,;]\s*|\s*[,;]\s*(?!\d)|\n+|\s+dan\s+/gi

export function splitSegments(text: string): string[] {
  return text
    .split(SEGMENT_SPLIT)
    .map((segment) => (segment ?? '').trim())
    .filter(Boolean)
}

function tokensOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  )
}

/** Income lines may only use income categories and spend lines may never use them —
 *  the same rule `draft.ts` and `flow-review.ts` enforce. */
function eligible(categories: Category[], type: BotTxType): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

export function resolveLocally(
  text: string,
  categories: Category[],
  hints: CategoryHint[],
  type: BotTxType = detectType(text) ?? 'expense',
): LocalMatch | null {
  const pool = eligible(categories, type)
  const lower = text.toLowerCase()

  // 1. The category's own name said outright. Length floors keep a two-letter category
  //    from matching half the alphabet.
  for (const category of pool) {
    const name = category.name.toLowerCase()
    if (name.length >= 4 && lower.includes(name)) {
      return { categoryId: category.id, categoryName: category.name, confidence: CATEGORY_NAME_CONFIDENCE, reason: 'category-name' }
    }
  }
  for (const category of pool) {
    const head = category.name.toLowerCase().split(/[\s&/]+/)[0]
    if (head.length >= 5 && lower.includes(head)) {
      return { categoryId: category.id, categoryName: category.name, confidence: CATEGORY_HEAD_CONFIDENCE, reason: 'category-name' }
    }
  }

  // 2. A keyword the user confirmed before. Confidence grows with how often they
  //    confirmed it — one accidental tap should not become a standing rule.
  const tokens = tokensOf(text)
  const byId = new Map(pool.map((c) => [c.id, c]))
  const best = hints
    .filter((h) => byId.has(h.categoryId) && (tokens.has(h.keyword) || tokens.has(keywordFor(h.keyword))))
    .sort((a, b) => b.frequency - a.frequency)[0]

  if (best) {
    const category = byId.get(best.categoryId)!
    return {
      categoryId: category.id,
      categoryName: category.name,
      confidence: Math.min(HINT_MAX_CONFIDENCE, HINT_BASE_CONFIDENCE + best.frequency * 5),
      reason: 'hint',
    }
  }

  return null
}

/**
 * All-or-nothing: either every segment resolves locally, or the whole message goes to
 * the model. Returning a partly-local batch would put confirmed knowledge and silent
 * defaults side by side with nothing to tell them apart.
 */
export function tryLocalBatch(
  text: string,
  categories: Category[],
  hints: CategoryHint[],
  now: Date,
): DraftLine[] | null {
  const segments = splitSegments(text)
  const lines: DraftLine[] = []

  for (const segment of segments) {
    const amount = parseAmount(segment)
    if (amount === null || amount <= 0) return null

    const type = detectType(segment) ?? 'expense'
    const match = resolveLocally(segment, categories, hints, type)
    if (!match || match.confidence < LOCAL_ACCEPT_CONFIDENCE) return null

    const date = new Date(now.getTime())
    date.setUTCDate(date.getUTCDate() + detectDateOffset(segment))

    lines.push({
      n: lines.length + 1,
      type,
      amount,
      description: segment.trim() || null,
      categoryId: match.categoryId,
      categoryName: match.categoryName,
      dateIso: date.toISOString(),
      confidence: match.confidence,
      options: eligible(categories, type).slice(0, 4).map((c) => ({ categoryId: c.id, name: c.name })),
    })
  }

  return lines.length > 0 ? lines : null
}
