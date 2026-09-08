import crypto from 'node:crypto'

/**
 * Shared bearer-token guard for the productivity cron endpoints (`/api/cron/reminders`,
 * `/api/cron/daily-digest`). The always-on Go heartbeat sends
 * `Authorization: Bearer <PRODUCTIVITY_CRON_SECRET>`.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.PRODUCTIVITY_CRON_SECRET ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  // Length guard first: timingSafeEqual throws when the two buffers differ in length — and
  // it is BYTES that must match, not JS chars (a multibyte header would slip past a
  // `.length` check and throw inside the compare).
  const a = Buffer.from(got)
  const b = Buffer.from(secret)
  if (!secret || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
