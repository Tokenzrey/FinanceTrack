import type { CategoryHint } from '@/shared/types/receipt-scanner.types'

/** Words that carry no signal about which category an item belongs to. */
const STOP_WORDS = new Set([
  'pcs',
  'pack',
  'bh',
  'btl',
  'kg',
  'gr',
  'gram',
  'ml',
  'ltr',
  'liter',
  'box',
  'dus',
  'sachet',
  'renceng',
  'x',
  'dan',
  'the',
  'of',
])

const MAX_HINTS = 200

/**
 * Reduces a receipt line to the keyword worth remembering.
 * "Indomie Goreng x3" → "indomie", "AQUA 600ML" → "aqua".
 *
 * Only the leading brand-ish token is kept: it is the part that repeats across
 * receipts, while sizes and quantities differ every time.
 */
export function keywordFor(itemName: string): string {
  const tokens = itemName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
    // A bare number ("600", "3") is a size or a count, never an identity.
    .filter((token) => !/^\d+$/.test(token))
    // "600ml", "1kg" — a number glued to a unit.
    .filter((token) => !/^\d+[a-z]{1,4}$/.test(token))

  return tokens[0] ?? ''
}

export interface LearnedCorrection {
  itemName: string
  categoryId: string
}

/**
 * Folds this scan's corrections into the stored hints.
 *
 * A keyword remembers exactly one category — the most recent choice wins, because a
 * user who re-files "indomie" has changed their mind, not added a second rule.
 * Frequency tracks how often the pairing was confirmed, and orders the list.
 */
export function applyCorrections(
  existing: CategoryHint[],
  corrections: LearnedCorrection[],
  now = Date.now(),
): CategoryHint[] {
  const byKeyword = new Map(existing.map((hint) => [hint.keyword, { ...hint }]))

  for (const correction of corrections) {
    const keyword = keywordFor(correction.itemName)
    if (!keyword || !correction.categoryId) continue

    const current = byKeyword.get(keyword)

    if (!current) {
      byKeyword.set(keyword, {
        keyword,
        categoryId: correction.categoryId,
        frequency: 1,
        updatedAt: now,
      })
      continue
    }

    if (current.categoryId === correction.categoryId) {
      current.frequency += 1
    } else {
      // Re-filed to a different category: start the new pairing's count over.
      current.categoryId = correction.categoryId
      current.frequency = 1
    }
    current.updatedAt = now
  }

  return [...byKeyword.values()]
    .sort((a, b) => b.frequency - a.frequency || b.updatedAt - a.updatedAt)
    .slice(0, MAX_HINTS)
}

/** Hints relevant to the items on this receipt, so the prompt stays small. */
export function hintsForItems(hints: CategoryHint[], itemNames: string[]): CategoryHint[] {
  const keywords = new Set(itemNames.map(keywordFor).filter(Boolean))
  return hints.filter((hint) => keywords.has(hint.keyword))
}
