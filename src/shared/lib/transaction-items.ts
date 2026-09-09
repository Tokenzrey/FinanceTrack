import type { TransactionItem } from '@/shared/types/domain'

/** Longest a derived title may run before it is cut with an ellipsis. */
const TITLE_MAX = 48

/**
 * A short label for a transaction. Uses the stored `title` when the itemized
 * schema wrote one; otherwise derives from `description` — the whole thing if it
 * is short, trimmed at a word boundary near {@link TITLE_MAX} with a trailing "…"
 * if not. Empty when there is nothing to derive from (the caller then shows the
 * category name instead).
 */
export function deriveTransactionTitle(tx: { title?: string; description?: string }): string {
  if (tx.title && tx.title.trim()) return tx.title.trim()

  const desc = (tx.description ?? '').trim()
  if (!desc) return ''
  if (desc.length <= TITLE_MAX) return desc

  const clipped = desc.slice(0, TITLE_MAX)
  const lastSpace = clipped.lastIndexOf(' ')
  const stem = lastSpace > TITLE_MAX / 2 ? clipped.slice(0, lastSpace) : clipped
  return `${stem.trimEnd()}…`
}

/**
 * Cleans a raw item list for storage: trims names, coerces qty/price to sane
 * numbers (qty a whole ≥ 1, price ≥ 0), and drops any row without a name.
 */
export function sanitizeItems(items: unknown): TransactionItem[] {
  if (!Array.isArray(items)) return []
  const out: TransactionItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!name) continue
    const qty = Math.max(1, Math.floor(Number(r.qty) || 1))
    const price = Math.max(0, Math.round(Number(r.price) || 0))
    out.push({ name, qty, price })
  }
  return out
}

/** Sum of line prices. */
export function itemsSubtotal(items: TransactionItem[]): number {
  return items.reduce((sum, i) => sum + i.price, 0)
}

/**
 * Scales line prices proportionally so their sum equals `target`, then drops any
 * rounding remainder onto the last line so the total is exact. A no-op when the
 * list is empty, the target is not positive, or the subtotal already matches.
 *
 * Used to keep AI-inferred items honest against the amount a deterministic parser
 * read from the same message (`parseAmount` is the source of truth for money).
 */
export function reconcileToTotal(items: TransactionItem[], target: number): TransactionItem[] {
  if (items.length === 0 || target <= 0) return items
  const subtotal = itemsSubtotal(items)
  if (subtotal === target || subtotal === 0) return items

  const factor = target / subtotal
  const scaled = items.map((i) => ({ ...i, price: Math.round(i.price * factor) }))
  const drift = target - itemsSubtotal(scaled)
  if (drift !== 0) {
    const last = scaled[scaled.length - 1]
    last.price = Math.max(0, last.price + drift)
  }
  return scaled
}
