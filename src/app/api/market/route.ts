import { NextResponse } from 'next/server'

/**
 * Market Pulse feed.
 *
 * Three of the five sources the plan wants are not usable as public, unauthenticated
 * APIs, each confirmed by an actual probe rather than assumed:
 *   - `api.bi.go.id/v1/finstat/monetory-policy` does not resolve (DNS failure).
 *   - The BPS web API rejects requests without a registered developer key.
 *   - DJPPR's SBN/ORI site (djppr.kemenkeu.go.id) is a client-rendered SPA with no
 *     documented public REST endpoint — the HTML shell loads, there is no JSON to read.
 * Rather than fabricate those numbers, they are served as clearly-labelled reference
 * values with a visible "as of" date. Forex and gold are genuinely live.
 *
 * Each reference value can be overridden without a code change via env vars — see
 * .env.example. Useful once a real, keyed BI/BPS/DJPPR feed becomes available, or simply
 * to keep the numbers current by hand without redeploying.
 */

export const revalidate = 3600 // 1 hour, matching the plan's cache TTL

export interface MarketQuote {
  label: string
  value: number
  unit: string
  /** Percent change where the source provides one. */
  change?: number
  source: string
  /** False when the number is a stored reference rather than a live fetch. */
  live: boolean
  asOf?: string
}

export interface MarketPulse {
  forex: MarketQuote | null
  gold: MarketQuote | null
  biRate: MarketQuote
  inflation: MarketQuote
  sbn: MarketQuote
  errors: string[]
}

/**
 * Last-known reference figures, overridable via env without a code change.
 * `_AS_OF` defaults to the date this fallback was last checked by hand — update it
 * whenever the number is updated, so the UI never shows a stale figure as current.
 */
const REFERENCE = {
  biRate: {
    value: Number(process.env.NEXT_PUBLIC_BI_RATE_OVERRIDE) || 5.75,
    asOf: process.env.NEXT_PUBLIC_BI_RATE_AS_OF || '2026-01',
  },
  inflation: {
    value: Number(process.env.NEXT_PUBLIC_INFLATION_RATE_OVERRIDE) || 2.84,
    asOf: process.env.NEXT_PUBLIC_INFLATION_RATE_AS_OF || '2026-01',
  },
  sbn: {
    value: Number(process.env.NEXT_PUBLIC_SBN_RATE_OVERRIDE) || 6.3,
    asOf: process.env.NEXT_PUBLIC_SBN_RATE_AS_OF || '2026-01',
  },
}

async function fetchForex(): Promise<MarketQuote | null> {
  try {
    // `from=USD` matters: without it the API answers in EUR and the rate is wrong.
    const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null

    const data = (await response.json()) as { rates?: { IDR?: number }; date?: string }
    const rate = data.rates?.IDR
    if (typeof rate !== 'number') return null

    return {
      label: 'USD/IDR',
      value: rate,
      unit: 'IDR',
      source: 'frankfurter.app',
      live: true,
      asOf: data.date,
    }
  } catch {
    return null
  }
}

async function fetchGold(): Promise<MarketQuote | null> {
  const key = process.env.GOLD_API_KEY
  if (!key) return null

  try {
    const response = await fetch('https://www.goldapi.io/api/XAU/IDR', {
      headers: { 'x-access-token': key },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null

    const data = (await response.json()) as { price_gram_24k?: number; chp?: number }
    if (typeof data.price_gram_24k !== 'number') return null

    return {
      label: 'Emas 24k',
      value: data.price_gram_24k,
      unit: 'IDR/gram',
      change: data.chp,
      source: 'goldapi.io',
      live: true,
    }
  } catch {
    return null
  }
}

export async function GET() {
  const [forex, gold] = await Promise.all([fetchForex(), fetchGold()])

  const errors: string[] = []
  if (!forex) errors.push('Kurs USD/IDR sedang tidak tersedia.')
  if (!gold) errors.push('Harga emas sedang tidak tersedia.')

  const payload: MarketPulse = {
    forex,
    gold,
    biRate: {
      label: 'BI Rate',
      value: REFERENCE.biRate.value,
      unit: '%',
      source: 'Referensi manual',
      live: false,
      asOf: REFERENCE.biRate.asOf,
    },
    inflation: {
      label: 'Inflasi (YoY)',
      value: REFERENCE.inflation.value,
      unit: '%',
      source: 'Referensi manual',
      live: false,
      asOf: REFERENCE.inflation.asOf,
    },
    sbn: {
      label: 'SBN Ritel',
      value: REFERENCE.sbn.value,
      unit: '%/thn',
      source: 'Referensi manual',
      live: false,
      asOf: REFERENCE.sbn.asOf,
    },
    errors,
  }

  return NextResponse.json(payload)
}
