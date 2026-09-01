import type { Pillar } from '@/shared/types/domain'

/**
 * Everything a public report link needs to render, and nothing else. Only the
 * aggregate numbers already shown on the Laporan page go in — never raw transactions,
 * descriptions, tags, or location. There is no server row behind the link: decoding
 * this payload back out of the URL is the entire "database".
 */
export interface SharedReportPayload {
  v: 1
  year: number
  month: number
  totalIncome: number
  totalBudget: number
  totalUsed: number
  totalSaved: number
  savingsRate: number
  netCashFlow: number
  pillars: { pillar: Pillar; budget: number; used: number }[]
  categories: { name: string; pillar: Pillar; budget: number; used: number }[]
}

/** Unicode-safe base64url — the standard `btoa(encodeURIComponent(...))` idiom, made
 *  URL-safe by swapping the three characters base64 uses that URLs don't allow bare. */
export function encodeSharedReport(payload: SharedReportPayload): string {
  const json = JSON.stringify(payload)
  const percentEncoded = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
  return btoa(percentEncoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeSharedReport(encoded: string): SharedReportPayload | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    const data = JSON.parse(json) as Partial<SharedReportPayload>
    if (
      data.v !== 1 ||
      typeof data.year !== 'number' ||
      typeof data.month !== 'number' ||
      typeof data.totalIncome !== 'number' ||
      !Array.isArray(data.pillars) ||
      !Array.isArray(data.categories)
    ) {
      return null
    }
    return data as SharedReportPayload
  } catch {
    return null
  }
}
