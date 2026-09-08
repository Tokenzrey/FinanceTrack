import { differenceInCalendarDays, format as formatDate, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import type { Timestamp } from 'firebase/firestore'

import { cn } from '@/shared/lib/utils'
import { dayKeyInTz } from '@/shared/lib/format'

interface DueChipProps {
  dueAt: Timestamp | null
  tz: string
  /** Injectable "now" so tests can freeze the clock. */
  now?: Date
}

/** Wall-clock hour/minute of `date` as seen in `tz`, e.g. `{ h: 14, m: 0 }`. */
function wallClock(date: Date, tz: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return { h: get('hour') % 24, m: get('minute') } // some engines emit "24" for midnight
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`

/**
 * Relative due-date chip: words for ±7 calendar days, an absolute date beyond.
 * The day diff is computed on tz-normalised calendar days (YYYY-MM-DD in `tz` for
 * both `dueAt` and `now`, then `differenceInCalendarDays`) so it stays correct
 * across midnight regardless of the viewer's own timezone.
 *
 * ponytail: exact only for fixed-offset zones (Asia/Jakarta, the app's target).
 * In a DST zone the day key is right but the non-midnight check near a DST
 * transition could be off by an hour — acceptable, no DST target ships.
 */
export function DueChip({ dueAt, tz, now = new Date() }: DueChipProps) {
  if (!dueAt) return null

  const due = dueAt.toDate()
  const dueKey = dayKeyInTz(due, tz)
  const dayDiff = differenceInCalendarDays(parseISO(dueKey), parseISO(dayKeyInTz(now, tz)))

  const { h, m } = wallClock(due, tz)
  const hasTime = h !== 0 || m !== 0
  const time = hhmm(h, m)

  const overdue = dayDiff < 0
  const near = !overdue && dayDiff <= 7 // within 7 days, not overdue
  const absolute = dayDiff < -7 || dayDiff > 7

  // `prefix` is the non-mono lead; `monoTime` (if set) is rendered font-mono.
  let prefix: string
  let monoTime: string | null = null
  if (absolute) {
    prefix = formatDate(parseISO(dueKey), 'd MMM', { locale: idLocale })
  } else if (dayDiff < 0) {
    prefix = `Terlambat ${-dayDiff} hari`
  } else if (dayDiff === 0) {
    prefix = 'Hari ini '
    monoTime = time
  } else if (dayDiff === 1) {
    prefix = hasTime ? 'Besok ' : 'Besok'
    monoTime = hasTime ? time : null
  } else {
    // 2..7 days ahead: short Indonesian weekday, + time when the task has one
    prefix = `${formatDate(parseISO(dueKey), 'EEE', { locale: idLocale })} `
    monoTime = hasTime ? time : null
    if (!hasTime) prefix = prefix.trimEnd()
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
        overdue && 'bg-destructive/10 text-destructive',
        near && 'text-foreground',
        absolute && 'text-muted-foreground',
      )}
    >
      {near && <Clock className="h-3 w-3" aria-hidden />}
      <span>
        {prefix}
        {monoTime && <span className="font-mono tabular-nums">{monoTime}</span>}
      </span>
    </span>
  )
}
