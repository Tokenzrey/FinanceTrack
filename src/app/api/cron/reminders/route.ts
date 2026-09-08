import { DEFAULT_TZ } from '@/shared/lib/format'
import type { Reminder, ReminderFreq } from '@/shared/types/productivity'
import {
  reapStuckSending,
  dueRemindersPage,
  claimReminder,
  markReminderSent,
  markReminderFailed,
  createReminder,
  recordCronRun,
  setPlannerLastPush,
} from '@/shared/bot/admin-data-productivity'
import { sendToUser } from '@/shared/bot/outbound'
import { reminderPush } from '@/shared/bot/replies-productivity'
import { authorizeCron } from '@/shared/bot/cron-auth'
import { reaperCutoff, backoffDelayMs, rollRecurrence, MAX_ATTEMPTS } from '@/shared/bot/reminder-engine'

/**
 * Consumer for due reminders. The always-on Go heartbeat POSTs here every ~60s. Each
 * run reaps crashed sends, then claims up to a page of due reminders atomically, pushes
 * each via the bot outbound path, rolls recurrences forward, and applies retry backoff.
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Stored `ReminderRecurrence` → the shape `createReminder`'s DTO wants. */
function toDto(r: Reminder['recurrence']): { freq: ReminderFreq; until: Date | null } | null {
  return r ? { freq: r.freq, until: r.until ? r.until.toDate() : null } : null
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) return new Response('unauthorized', { status: 401 })

  const started = Date.now()
  const now = new Date()
  const reaped = await reapStuckSending(reaperCutoff(now))
  const due = await dueRemindersPage(now, 25)

  let sent = 0
  let failed = 0

  for (const { ref } of due) {
    const claimed = await claimReminder(ref)
    if (!claimed) continue

    let res: { ok: boolean; sent: number; error?: string }
    try {
      const push = reminderPush(claimed, DEFAULT_TZ)
      res = await sendToUser(claimed.ownerId, push.text, { buttons: push.buttons })
    } catch (err) {
      // A thrown render or link lookup counts as a failed send, not a batch abort.
      res = { ok: false, sent: 0, error: String(err).slice(0, 200) }
    }

    if (res.ok) {
      sent++
      // The message is already out. Create the next occurrence BEFORE flipping this row
      // to `sent`: the reaper only rescues `sending`, so a throw after `sent` would kill
      // a recurring series for good. A throw here leaves the row `sending`, which the
      // next run's reaper picks up and retries end to end.
      try {
        const next = rollRecurrence(claimed, now)
        if (next) {
          await createReminder(
            claimed.ownerId,
            {
              message: claimed.message,
              remindAt: next,
              recurrence: toDto(claimed.recurrence),
              source: 'auto',
            },
            { kind: claimed.kind, taskId: claimed.taskId },
          )
        }
        await markReminderSent(ref, { rolledAt: next })
        await setPlannerLastPush(claimed.ownerId, claimed.id)
      } catch (err) {
        console.error('cron/reminders post-send bookkeeping failed:', claimed.id, err)
      }
    } else {
      const attempts = claimed.attempts
      const giveUp = attempts >= MAX_ATTEMPTS
      await markReminderFailed(
        ref,
        (res.error ?? 'send failed').slice(0, 200),
        giveUp ? null : new Date(now.getTime() + backoffDelayMs(attempts)),
      )
      failed++
    }
  }

  await recordCronRun({
    endpoint: 'reminders',
    startedAt: now,
    claimed: due.length,
    sent,
    failed,
    durationMs: Date.now() - started,
  })

  return Response.json({ ok: true, reaped, claimed: due.length, sent, failed })
}
