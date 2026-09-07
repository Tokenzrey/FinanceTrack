import { format as formatDate } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const LOCALE = 'id-ID'

const idr = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const idrWithCents = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plainNumber = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })

/** "Rp 7.500.000" */
export function formatIDR(value: number, showCents = false): string {
  if (!Number.isFinite(value)) return 'Rp 0'
  return showCents ? idrWithCents.format(value) : idr.format(value)
}

/** "7.500.000" — for inputs and table cells that render their own currency mark. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return plainNumber.format(value)
}

/** "Rp 7,5 jt" — compact form for KPI cards and chart axes. */
export function formatIDRCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}Rp ${trimZero(abs / 1_000_000_000)} M`
  if (abs >= 1_000_000) return `${sign}Rp ${trimZero(abs / 1_000_000)} jt`
  if (abs >= 1_000) return `${sign}Rp ${trimZero(abs / 1_000)} rb`
  return formatIDR(value)
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '').replace('.', ',')
}

/** Strips everything but digits — "Rp 1.500.000" → 1500000. */
export function parseIDR(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(fractionDigits).replace('.', ',')}%`
}

export function formatDay(date: Date): string {
  return formatDate(date, 'd MMM yyyy', { locale: idLocale })
}

export function formatMonthLong(year: number, month: number): string {
  return formatDate(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: idLocale })
}

export function formatMonthShort(year: number, month: number): string {
  return formatDate(new Date(year, month - 1, 1), 'MMM yy', { locale: idLocale })
}

/** Firestore document id for a monthly budget: "2026-08". */
export function yearMonthId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseYearMonthId(id: string): { year: number; month: number } {
  const [year, month] = id.split('-')
  return { year: Number(year), month: Number(month) }
}

export const DEFAULT_TZ = 'Asia/Jakarta'

/** Label zona Indonesia. Zona lain tidak diberi label — lebih baik tanpa keterangan
 *  daripada salah menyebut "WIB" untuk jam yang bukan WIB. */
const TZ_LABELS: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

/**
 * "Min, 6 Sep 2026 · 14.32 WIB" — stempel yang dibawa setiap balasan transaksi bot.
 *
 * Wajib melalui `timeZone`: server Vercel berjalan di UTC, jadi `date.getHours()`
 * akan meleset 7 jam untuk user Indonesia. Pemisah jam titik (14.32) adalah konvensi
 * `id-ID` bawaan Intl, bukan salah ketik.
 */
export function formatDateTime(date: Date, timeZone: string = DEFAULT_TZ): string {
  const day = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  const label = TZ_LABELS[timeZone]
  return `${day} · ${time}${label ? ` ${label}` : ''}`
}

/** "Minggu, 6 September 2026" — untuk judul yang tidak butuh jam. */
export function formatDayLong(date: Date, timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** "yyyy-MM-dd" untuk `date` sebagaimana terlihat di `timeZone` — kunci yang harus
 *  dipakai filter "hari ini" supaya harinya berganti di tengah malam lokal. */
export function dayKeyInTz(date: Date, timeZone: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
