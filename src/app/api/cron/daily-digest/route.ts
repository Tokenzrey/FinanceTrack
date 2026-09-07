import { authorizeCron } from '@/shared/bot/cron-auth'
import { digestBody } from '@/shared/bot/reminder-engine'
import {
  usersDueForDigest,
  markDigestSent,
  listTasks,
  listRemindersForDay,
  recordCronRun,
} from '@/shared/bot/admin-data-productivity'
import { sendToUser } from '@/shared/bot/outbound'
import { dayKeyInTz, formatDayLong } from '@/shared/lib/format'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!authorizeCron(req)) return new Response('unauthorized', { status: 401 })
  const started = Date.now()
  const now = new Date()
  const users = (await usersDueForDigest(now)).slice(0, 50)
  let sent = 0
  let failed = 0
  for (const { userId, tz } of users) {
    try {
      const [tasks, reminders] = await Promise.all([
        listTasks(userId, 'today', tz),
        listRemindersForDay(userId, now, tz),
      ])
      const body = digestBody(tasks, reminders, tz, formatDayLong(now, tz))
      const res = await sendToUser(userId, body)
      if (res.ok) {
        await markDigestSent(userId, dayKeyInTz(now, tz))
        sent++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }
  await recordCronRun({
    endpoint: 'daily-digest',
    startedAt: now,
    claimed: users.length,
    sent,
    failed,
    durationMs: Date.now() - started,
  })
  return Response.json({ ok: true, candidates: users.length, sent, failed })
}
