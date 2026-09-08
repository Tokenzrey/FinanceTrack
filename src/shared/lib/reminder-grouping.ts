import {
  addDays,
  differenceInHours,
  differenceInMinutes,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { Reminder } from '@/shared/types/productivity'

export type ReminderGroupKey = 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'failed'

export interface ReminderGroup {
  key: ReminderGroupKey
  /** Indonesian: 'Hari ini' | 'Besok' | 'Minggu ini' | 'Nanti' | 'Gagal terkirim'. */
  label: string
  /** Sorted: time groups by `remindAt` asc; `failed` by `remindAt` desc (newest failure first). */
  reminders: Reminder[]
}

const GROUP_ORDER: ReminderGroupKey[] = ['today', 'tomorrow', 'thisWeek', 'later', 'failed']

const GROUP_LABELS: Record<ReminderGroupKey, string> = {
  today: 'Hari ini',
  tomorrow: 'Besok',
  thisWeek: 'Minggu ini',
  later: 'Nanti',
  failed: 'Gagal terkirim',
}

/**
 * Buckets reminders into time-proximity groups relative to the injected `now`
 * (deterministic — no `new Date()` inside). A `failed` reminder ALWAYS goes to
 * `failed` regardless of its `remindAt`. `sent` and `cancelled` are dropped.
 * Only `pending` / `sending` are bucketed into the time groups:
 *  - today:     same calendar day as `now` — INCLUDING past-due pending reminders
 *               (remindAt already before `now`): the cron hasn't fired them yet,
 *               and they are the most urgent, so they surface at the top.
 *  - tomorrow:  the next calendar day.
 *  - thisWeek:  after tomorrow, up to and including the end of `now`'s week
 *               (weekStartsOn: 1 / Monday).
 *  - later:     everything beyond this week.
 * Returns ONLY non-empty groups, in the fixed order:
 *   today, tomorrow, thisWeek, later, failed.
 */
export function groupReminders(reminders: Reminder[], now: Date): ReminderGroup[] {
  const tomorrow = addDays(now, 1)
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const buckets: Record<ReminderGroupKey, Reminder[]> = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    failed: [],
  }

  for (const reminder of reminders) {
    if (reminder.status === 'failed') {
      buckets.failed.push(reminder)
      continue
    }
    if (reminder.status !== 'pending' && reminder.status !== 'sending') continue

    const at = reminder.remindAt.toDate()
    if (isSameDay(at, now) || at.getTime() < now.getTime()) {
      buckets.today.push(reminder)
    } else if (isSameDay(at, tomorrow)) {
      buckets.tomorrow.push(reminder)
    } else if (isWithinInterval(at, { start: tomorrow, end: weekEnd })) {
      buckets.thisWeek.push(reminder)
    } else {
      buckets.later.push(reminder)
    }
  }

  const asc = (a: Reminder, b: Reminder) => a.remindAt.toMillis() - b.remindAt.toMillis()
  const desc = (a: Reminder, b: Reminder) => b.remindAt.toMillis() - a.remindAt.toMillis()

  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    reminders: buckets[key].sort(key === 'failed' ? desc : asc),
  }))
}

/**
 * Raw `lastError` code → a human Indonesian sentence. Check order (case-insensitive
 * substring): not_linked → whatsapp_http → telegram_http → timeout/network keywords
 * → fallback "Gagal terkirim".
 */
export function humanizeReminderError(lastError: string | null): string {
  const code = (lastError ?? '').toLowerCase()
  if (code.includes('not_linked')) return 'Nomor WhatsApp atau Telegram belum tertaut'
  if (code.includes('whatsapp_http')) return 'Layanan WhatsApp sedang tidak merespons'
  if (code.includes('telegram_http')) return 'Layanan Telegram sedang tidak merespons'
  if (
    code.includes('timeout') ||
    code.includes('timed out') ||
    code.includes('aborted') ||
    code.includes('abort') ||
    code.includes('fetch failed') ||
    code.includes('enotfound') ||
    code.includes('network')
  ) {
    return 'Layanan chat sedang tidak merespons'
  }
  return 'Gagal terkirim'
}

/**
 * Relative-time phrase for a reminder's fire time, Indonesian:
 *  past/now → "sekarang"; < 60 min → "dalam N menit"; same calendar day → "dalam N jam";
 *  tomorrow → "besok HH.mm"; later this week → "EEEE HH.mm" (e.g. "Sabtu 09.00");
 *  beyond → "d MMM" (e.g. "3 Okt"). Deterministic on the injected `now`.
 */
export function relativeReminderTime(remindAt: Date, now: Date): string {
  if (remindAt.getTime() <= now.getTime()) return 'sekarang'

  const minutes = differenceInMinutes(remindAt, now)
  if (minutes < 60) return `dalam ${minutes} menit`

  if (isSameDay(remindAt, now)) {
    return `dalam ${differenceInHours(remindAt, now)} jam`
  }

  if (isSameDay(remindAt, addDays(now, 1))) {
    return `besok ${format(remindAt, 'HH.mm', { locale: idLocale })}`
  }

  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  if (isWithinInterval(remindAt, { start: now, end: weekEnd })) {
    return format(remindAt, 'EEEE HH.mm', { locale: idLocale })
  }

  return format(remindAt, 'd MMM', { locale: idLocale })
}
