import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { setPlannerPrefs, upsertDigestRoster } from '@/shared/bot/admin-data-productivity'
import { getUserTimezone } from '@/shared/bot/admin-data'

export const runtime = 'nodejs'

/** Same bearer-token check as `/api/bot/link-code` — returns the uid, or the
 *  NextResponse to return as-is on failure. */
async function authenticate(req: NextRequest): Promise<string | NextResponse> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  try {
    return (await verifyFirebaseIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Sesi tidak valid. Masuk ulang lalu coba lagi.' }, { status: 401 })
  }
}

const WEEK_MINUTES = 7 * 24 * 60

/**
 * Writes both docs the scheduling crons read: `users/{uid}/meta/plannerPrefs` and this
 * user's line in `bot_meta/digestRoster`. The client can only READ `plannerPrefs`; every
 * write goes through here so `bot_meta` can stay deny-all.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req)
  if (auth instanceof NextResponse) return auth
  const uid = auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const digestHour = Number(b.digestHour)
  const digestEnabled = Boolean(b.digestEnabled)
  const rawLeads = Array.isArray(b.taskLeadsMinutes) ? b.taskLeadsMinutes : []
  const taskLeadsMinutes = rawLeads
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= WEEK_MINUTES)

  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    return NextResponse.json({ error: 'Jam rekap harus 0–23.' }, { status: 400 })
  }
  if (taskLeadsMinutes.length === 0) taskLeadsMinutes.push(0)

  await setPlannerPrefs(uid, { digestHour, digestEnabled, taskLeadsMinutes })
  const tz = await getUserTimezone(uid)
  await upsertDigestRoster(uid, digestEnabled ? { tz, digestHour } : null)

  return NextResponse.json({ ok: true })
}
