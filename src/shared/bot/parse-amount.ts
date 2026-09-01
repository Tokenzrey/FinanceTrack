/**
 * Deterministic parser for Indonesian shorthand amounts — never AI. A misread amount
 * is the single most expensive, least-noticed failure mode in a finance app; "rb/k/jt
 * + thousands separator" is simple enough to write explicitly and test exhaustively.
 * Gemini only ever handles what's genuinely fuzzy: intent and category.
 */

const MULTIPLIERS: Record<string, number> = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
}

// A number (optionally with one decimal separator, "." or ","), optional space, then
// a recognised multiplier word. Matches "35rb", "35 rb", "1.5jt", "1,5 juta".
const SHORTHAND_RE = /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)\b/i

// A plain Rupiah figure: either grouped in threes with "." or "," separators
// ("250.000"), or a bare run of 2+ digits ("250000"). Requiring 2+ digits (not 1+)
// keeps a lone quantity like "2" in "beli 2 kopi 35000" from ever being a candidate.
const PLAIN_RE = /(?:rp\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{2,})/gi

/**
 * Parses one Indonesian-style amount out of free text, e.g. "beli kopi 35rb" → 35000.
 * Returns `null` when no plausible positive amount is found.
 *
 * Two conventions are disambiguated by whether a shorthand suffix follows the number:
 *  - WITH a suffix ("1.5jt", "1,5 juta"), the "." or "," is a decimal point: 1.5 × 1e6.
 *  - WITHOUT one ("250.000", "Rp250.000"), "." and "," are thousands separators to
 *    strip, matching how Rupiah prices are conventionally written.
 *
 * When a message has more than one plain number ("beli 2 kopi 35000"), the largest is
 * taken as the amount — a leading quantity or item count is virtually always smaller
 * than the actual price in a short transaction message.
 */
export function parseAmount(input: string): number | null {
  // An explicit negative sign is rejected outright rather than silently made
  // positive — an amount this bot records is never negative.
  if (/-\s*\d|\bminus\s+\d/i.test(input)) return null

  const shorthand = input.match(SHORTHAND_RE)
  if (shorthand) {
    const value = Number(shorthand[1].replace(',', '.'))
    const multiplier = MULTIPLIERS[shorthand[2].toLowerCase()]
    const amount = Math.round(value * multiplier)
    return amount > 0 ? amount : null
  }

  let best: number | null = null
  for (const match of input.matchAll(PLAIN_RE)) {
    const digits = match[1].replace(/[.,]/g, '')
    const value = Number(digits)
    if (Number.isFinite(value) && value > 0 && (best === null || value > best)) {
      best = value
    }
  }
  return best
}
