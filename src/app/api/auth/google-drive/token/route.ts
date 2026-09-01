import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { getDriveLinkDoc, deleteDriveLinkDoc } from '@/shared/lib/firestore-rest'
import { decryptSecret } from '@/shared/lib/token-crypto'

export const runtime = 'nodejs'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/**
 * Mints a short-lived Drive access token from the stored refresh token — the endpoint
 * every "no more reauth" claim in this app rests on. No popup, no browser involvement:
 * a linked user gets a working token here on any device, any tab, indefinitely.
 */
export async function GET(request: NextRequest) {
  const idToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!idToken) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  let uid: string
  try {
    ;({ uid } = await verifyFirebaseIdToken(idToken))
  } catch {
    return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 })
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google Drive belum dikonfigurasi di server.' }, { status: 503 })
  }

  let doc
  try {
    doc = await getDriveLinkDoc(uid, idToken)
  } catch (error) {
    console.error('google-drive/token Firestore read error:', error)
    return NextResponse.json({ error: 'Gagal memeriksa status tautan.' }, { status: 500 })
  }
  if (!doc) return NextResponse.json({ linked: false })

  // A dead grant (revoked at myaccount.google.com) and an undecryptable record (e.g. a
  // rotated TOKEN_ENCRYPTION_KEY) both mean the same thing from here: this stored
  // record can never mint a token again. Both self-heal the same way — delete it and
  // report "not linked" — rather than one recovering (re-link prompt) and the other
  // failing outright every call until someone notices.
  try {
    const refreshToken = decryptSecret(doc.enc)

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!tokenRes.ok) {
      await deleteDriveLinkDoc(uid, idToken).catch(() => {})
      return NextResponse.json({ linked: false })
    }

    const data = (await tokenRes.json()) as { access_token: string; expires_in: number }
    return NextResponse.json({
      linked: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      googleEmail: doc.googleEmail,
    })
  } catch (error) {
    console.error('google-drive/token error (stale/corrupt record, resetting link):', error)
    await deleteDriveLinkDoc(uid, idToken).catch(() => {})
    return NextResponse.json({ linked: false })
  }
}
