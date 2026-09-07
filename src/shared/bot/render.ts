import { formatIDR } from '@/shared/lib/format'
import type { BudgetStatus } from '@/shared/types/domain'

/**
 * Small visual primitives shared by every rich reply. Block characters and monospace
 * are the only "chart" both platforms render identically — Telegram inside <code>,
 * WhatsApp inside backticks, both fixed-width.
 */

const FILLED = '█'
const EMPTY = '░'

export function bar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return FILLED.repeat(filled) + EMPTY.repeat(width - filled)
}

/** Below one percent is noise, not a trend — calling it flat avoids a fake signal. */
export function trendArrow(deltaPercent: number): string {
  if (deltaPercent > 1) return '▲'
  if (deltaPercent < -1) return '▼'
  return '▬'
}

export function statusEmoji(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    safe: '🟢',
    warning: '🟡',
    danger: '🟠',
    exceeded: '🔴',
  }
  return map[status]
}

/** `formatIDR` (Intl `id-ID`) joins "Rp" to the number with a non-breaking space;
 *  chat clients render a plain one and the byte-exact reply tests assert it. */
function idr(amount: number): string {
  return formatIDR(amount).replace(/\u00A0/g, ' ')
}

/** The one money-column helper: amounts right-aligned to a common width so the block
 *  reads as a column, NBSP normalised to a plain space. `replies.ts` routes its totals
 *  blocks through this too — there is no second convention. */
export function moneyColumn(rows: { label: string; amount: number }[]): string[] {
  const width = Math.max(...rows.map((r) => idr(r.amount).length))
  const labelWidth = Math.max(...rows.map((r) => r.label.length))
  return rows.map(
    (r) => `${r.label.padEnd(labelWidth, ' ')}  <code>${idr(r.amount).padStart(width, ' ')}</code>`,
  )
}
