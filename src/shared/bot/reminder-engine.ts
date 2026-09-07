import { formatDateTime } from '@/shared/lib/format'
import type { Reminder, Task } from '@/shared/types/productivity'

/**
 * Pure scheduling maths for the reminder cron consumer (`/api/cron/reminders`) and
 * its sibling digest job. No I/O — every function is a plain transform so both the
 * handler and its tests can call them freely.
 */

const DAY_MS = 86_400_000

/** `status:'sending'` rows older than this are assumed crashed mid-send. */
export function reaperCutoff(now: Date): Date {
  return new Date(now.getTime() - 5 * 60_000)
}

/** Exponential backoff between retries: 1m, 2m, 4m, 8m, 16m, then capped at 30m. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1))
}

export const MAX_ATTEMPTS = 5

// `weekday` / `weekly` step with getUTCDay: `remindAt` is already a UTC instant
// derived from a local wall-time, so DST shifts do not apply for Asia/Jakarta — the
// repo's target zone.
// ponytail: UTC-day arithmetic; add a tz-aware roll if a DST zone is ever supported.
/** next occurrence after `from`, or null if past `until` / not recurring */
export function rollRecurrence(
  r: Pick<Reminder, 'recurrence' | 'remindAt'>,
  from: Date,
): Date | null {
  if (!r.recurrence) return null
  const base = r.remindAt.toDate()
  let next = new Date(base)
  for (let i = 0; i < 400; i++) {
    if (r.recurrence.freq === 'daily') next = new Date(next.getTime() + DAY_MS)
    else if (r.recurrence.freq === 'weekday') {
      do {
        next = new Date(next.getTime() + DAY_MS)
      } while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
    } else {
      // weekly
      next = new Date(next.getTime() + 7 * DAY_MS)
    }
    if (next > from) break
  }
  if (r.recurrence.until && next > r.recurrence.until.toDate()) return null
  return next
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Compose a morning digest message body for a user's task + reminder agenda.
 *  Pure: no I/O, no Date.now(). */
export function digestBody(tasks: Task[], reminders: Reminder[], tz: string, dayLabel: string): string {
  const header = `☀️ <b>Selamat pagi!</b> — ${escapeHtml(dayLabel)}`
  const countLine = `${tasks.length} tugas, ${reminders.length} pengingat untuk hari ini`

  // Empty agenda → early return with all-clear line
  if (tasks.length === 0 && reminders.length === 0) {
    return `${header}\n${countLine}\n\nTidak ada agenda hari ini — nikmati harimu ☕`
  }

  // Build task list
  const taskLines = tasks.map((t, i) => `${i + 1}. ${escapeHtml(t.title)}`)

  // Build reminder list
  const reminderLines = reminders.map(
    (r) => `• ${escapeHtml(r.message)} — ${formatDateTime(r.remindAt.toDate(), tz)}`,
  )

  const content = [...taskLines, ...reminderLines].join('\n')
  return `${header}\n${countLine}\n\n${content}`
}
