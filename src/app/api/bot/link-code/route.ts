import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { createLinkCode, deleteLink } from '@/shared/bot/admin-data'
import type { BotPlatform } from '@/shared/bot/types'

export const runtime = 'nodejs'

const PLATFORMS: BotPlatform[] = ['telegram', 'whatsapp']

/** Same bearer-token check as `/api/ai/scan-receipt` — returns the uid, or the
 *  NextResponse to return as-is on failure. */
async function authenticate(request: NextRequest): Promise<string | NextResponse> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  try {
    const user = await verifyFirebaseIdToken(token)
    return user.uid
  } catch {
    return NextResponse.json({ error: 'Sesi tidak valid. Masuk ulang lalu coba lagi.' }, { status: 401 })
  }
}

/** Creates a one-time, 15-minute link code the user pastes into either bot chat —
 *  platform-agnostic, `consumeLinkCode` learns which platform from the chat it
 *  arrives in. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request)
  if (auth instanceof NextResponse) return auth

  const { code, expiresAt } = await createLinkCode(auth)
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() })
}

/** Unlinks one platform (`?platform=telegram|whatsapp`) — the other stays linked. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request)
  if (auth instanceof NextResponse) return auth

  const platform = new URL(request.url).searchParams.get('platform')
  if (!platform || !PLATFORMS.includes(platform as BotPlatform)) {
    return NextResponse.json({ error: 'Platform tidak valid.' }, { status: 400 })
  }

  await deleteLink(auth, platform as BotPlatform)
  return NextResponse.json({ ok: true })
}
