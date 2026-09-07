import crypto from 'node:crypto'

/**
 * Shared bearer-token guard for the productivity cron endpoints (`/api/cron/reminders`,
 * `/api/cron/daily-digest`). The always-on Go heartbeat sends
 * `Authorization: Bearer <PRODUCTIVITY_CRON_SECRET>`.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.PRODUCTIVITY_CRON_SECRET ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  // Length guard first: timingSafeEqual throws when the two buffers differ in length.
  if (!secret || got.length !== secret.length) return false
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))
}
