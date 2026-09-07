/**
 * Deterministic natural-language "when" parser for the productivity suite — never AI.
 * Turns Indonesian phrases ("besok jam 3 sore", "dalam 2 jam", "tiap hari kerja jam 8")
 * into an absolute UTC instant plus an optional recurrence. Pure and I/O-free: consumed
 * by the bot command parser (Task 6) and the web quick-add (Task 15).
 */
import type { ReminderFreq } from '@/shared/types/productivity'
import { parseDateWord } from '@/shared/bot/review-commands'

export interface ParsedWhen {
  at: Date
  recurrence: { freq: ReminderFreq; until: Date | null } | null
  timeWasImplicit: boolean
}

// getUTCDay convention: 0 = Sunday.
const DAYS = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

const RE_HHMM = /\b(\d{1,2})[:.](\d{2})\b/
const RE_JAM = /\bjam\s+(\d{1,2})(?:\s*(pagi|siang|sore|malam))?\b/
const RE_HPART = /\b(\d{1,2})\s+(pagi|siang|sore|malam)\b/
// Duration only counts as a duration when marked by "dalam …" or "… lagi"; a bare
// "jam 8" must stay a clock time.
const RE_DUR = /\b(?:dalam\s+(\d{1,3})\s*(menit|jam|hari)|(\d{1,3})\s*(menit|jam|hari)\s+lagi)\b/

const RE_FUTURE_WORD = /\b(hari ini|besok|bsk|lusa)\b/
const RE_RECUR = /\b(tiap|setiap)\b/
const RE_DATE_TOKEN = /\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|kemarin lusa|kemarin/

const UNIT_MS: Record<string, number> = {
  menit: 60_000,
  jam: 3_600_000,
  hari: 86_400_000,
}

interface Ymd {
  y: number
  mo0: number
  d: number
}

/**
 * Milliseconds `timeZone` is ahead of UTC at instant `at`. Same pattern as
 * core.ts `tzOffsetMs`, using `Intl.DateTimeFormat` so a WITA/WIT user gets their own
 * offset. Copied here to avoid importing the heavy core.ts module.
 */
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour === 24 ? 0 : +p.hour,
    +p.minute,
    +p.second,
  )
  return asUTC - at.getTime()
}

/** Build a UTC instant from local wall-clock components in `timeZone`. */
function localWallToUtc(
  y: number,
  mo0: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(y, mo0, d, h, mi, 0))
  const off = tzOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - off)
}

/** Local calendar date of instant `at` in `timeZone`, month 0-indexed. */
function localYmd(at: Date, timeZone: string): Ymd {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]))
  return { y: +p.year, mo0: +p.month - 1, d: +p.day }
}

/** `base` shifted by `days`, read back as 0-indexed calendar components. */
function shiftYmd(base: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(base.y, base.mo0, base.d))
  d.setUTCDate(d.getUTCDate() + days)
  return { y: d.getUTCFullYear(), mo0: d.getUTCMonth(), d: d.getUTCDate() }
}

function dowOf(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.y, ymd.mo0, ymd.d)).getUTCDay()
}

/** Adjust a bare hour by an Indonesian day-part word. */
function applyDaypart(h: number, part: string | undefined): number {
  if (!part || part === 'pagi') return h
  if (part === 'siang') return h >= 12 && h <= 14 ? h : 12
  // sore / malam
  return h < 12 ? h + 12 : h
}

interface TimeOfDay {
  h: number
  mi: number
  implicit: boolean
}

function extractTime(text: string): TimeOfDay {
  const hhmm = text.match(RE_HHMM)
  if (hhmm) return { h: +hhmm[1], mi: +hhmm[2], implicit: false }

  const jam = text.match(RE_JAM)
  if (jam) return { h: applyDaypart(+jam[1], jam[2]), mi: 0, implicit: false }

  const hpart = text.match(RE_HPART)
  if (hpart) return { h: applyDaypart(+hpart[1], hpart[2]), mi: 0, implicit: false }

  return { h: 9, mi: 0, implicit: true }
}

function detectRecurrence(
  text: string,
): { rec: { freq: ReminderFreq; until: Date | null }; weekday: number } | null {
  if (!RE_RECUR.test(text)) return null
  if (/hari kerja/.test(text)) return { rec: { freq: 'weekday', until: null }, weekday: -1 }
  if (/\bhari\b/.test(text)) return { rec: { freq: 'daily', until: null }, weekday: -1 }
  for (let i = 0; i < DAYS.length; i++) {
    if (new RegExp(`\\b${DAYS[i]}\\b`).test(text)) {
      return { rec: { freq: 'weekly', until: null }, weekday: i }
    }
  }
  return null
}

/** First occurrence of the recurrence at wall time `h:mi` that is >= `now`. */
function nextOccurrence(
  now: Date,
  timeZone: string,
  freq: ReminderFreq,
  weekday: number,
  h: number,
  mi: number,
): Date {
  const today = localYmd(now, timeZone)
  for (let i = 0; i < 8; i++) {
    const day = shiftYmd(today, i)
    const dow = dowOf(day)
    if (freq === 'weekday' && (dow === 0 || dow === 6)) continue
    if (freq === 'weekly' && dow !== weekday) continue
    const at = localWallToUtc(day.y, day.mo0, day.d, h, mi, timeZone)
    if (at.getTime() >= now.getTime()) return at
  }
  // Unreachable for daily/weekday (i=1 always qualifies) and for weekly within 8 days.
  const day = shiftYmd(today, 7)
  return localWallToUtc(day.y, day.mo0, day.d, h, mi, timeZone)
}

export function parseWhen(text: string, now: Date, timeZone: string): ParsedWhen | null {
  const lower = text.trim().toLowerCase()
  if (!lower) return null

  const recurrence = detectRecurrence(lower)

  // 1. Duration ("dalam 2 jam", "10 menit lagi"): at = now + duration.
  const dur = lower.match(RE_DUR)
  if (dur) {
    const n = +(dur[1] ?? dur[3])
    const unit = dur[2] ?? dur[4]
    return {
      at: new Date(now.getTime() + n * UNIT_MS[unit]),
      recurrence: recurrence?.rec ?? null,
      timeWasImplicit: false,
    }
  }

  const time = extractTime(lower)

  // 2. Recurrence: at = next occurrence >= now.
  if (recurrence) {
    return {
      at: nextOccurrence(now, timeZone, recurrence.rec.freq, recurrence.weekday, time.h, time.mi),
      recurrence: recurrence.rec,
      timeWasImplicit: time.implicit,
    }
  }

  // 3. Base date.
  let ymd: Ymd | null = null

  const future = lower.match(RE_FUTURE_WORD)
  if (future) {
    const word = future[1]
    const offset = word === 'lusa' ? 2 : word === 'hari ini' ? 0 : 1
    ymd = shiftYmd(localYmd(now, timeZone), offset)
  } else {
    const dayName = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(lower))
    if (dayName >= 0) {
      const today = localYmd(now, timeZone)
      for (let i = 1; i <= 7; i++) {
        const cand = shiftYmd(today, i)
        if (dowOf(cand) === dayName) {
          ymd = cand
          break
        }
      }
    }
  }

  if (!ymd) {
    const token = lower.match(RE_DATE_TOKEN)
    const parsed = parseDateWord(token ? token[0] : lower, now)
    if (parsed) {
      ymd = { y: parsed.getUTCFullYear(), mo0: parsed.getUTCMonth(), d: parsed.getUTCDate() }
    }
  }

  // 4. No date word: fall back to today/tomorrow if there is an explicit clock,
  // otherwise there is no time hint at all.
  if (!ymd) {
    if (time.implicit) return null
    const today = localYmd(now, timeZone)
    let at = localWallToUtc(today.y, today.mo0, today.d, time.h, time.mi, timeZone)
    if (at.getTime() < now.getTime()) {
      const tomorrow = shiftYmd(today, 1)
      at = localWallToUtc(tomorrow.y, tomorrow.mo0, tomorrow.d, time.h, time.mi, timeZone)
    }
    return { at, recurrence: null, timeWasImplicit: false }
  }

  return {
    at: localWallToUtc(ymd.y, ymd.mo0, ymd.d, time.h, time.mi, timeZone),
    recurrence: null,
    timeWasImplicit: time.implicit,
  }
}

const STRIP_PATTERNS: RegExp[] = [
  RE_JAM,
  RE_HHMM,
  RE_DUR,
  /\bjam\s+\d/,
  /\b(hari ini|besok|bsk|lusa|kemarin( lusa)?)\b/,
  /\b(tiap|setiap)\s+(hari kerja|hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/,
  /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/,
]

/** Drop the temporal phrase so the remainder can serve as a title/message. */
export function stripWhenTokens(text: string): string {
  let out = text
  for (const re of STRIP_PATTERNS) {
    out = out.replace(new RegExp(re.source, 'gi'), ' ')
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}
