import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { setDriveLinkDoc } from '@/shared/lib/firestore-rest'
import { encryptSecret } from '@/shared/lib/token-crypto'

export const runtime = 'nodejs'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  id_token?: string
}

/** Decodes the `email` claim out of a Google-issued id_token JWT — no verification
 * needed: we obtained it ourselves, server-to-server, via our own client_secret. */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.email === 'string' ? json.email : null
  } catch {
    return null
  }
}

/**
 * One-time exchange: the authorization `code` from the client's consent popup becomes
 * a refresh token here, encrypted, and stored — this is the step that makes every
 * future Drive access silent (see /token).
 */
export async function POST(request: NextRequest) {
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

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }
  if (!body.code) return NextResponse.json({ error: 'Kode otorisasi tidak ada.' }, { status: 400 })

  try {
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: body.code,
        client_id: clientId,
        client_secret: clientSecret,
        // GIS's popup auth-code flow always exchanges against this literal value.
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => '')
      console.error('google-drive/link token exchange failed:', detail)
      return NextResponse.json({ error: 'Google menolak permintaan tautan.' }, { status: 502 })
    }

    const data = (await tokenRes.json()) as GoogleTokenResponse
    if (!data.refresh_token) {
      // Should not happen — the client always requests prompt:'consent' — but a stale
      // grant could theoretically omit it, and silently "succeeding" without one would
      // just mean every future token mint fails instead.
      return NextResponse.json(
        { error: 'Google tidak memberi izin permanen. Coba tautkan ulang.' },
        { status: 409 },
      )
    }

    const googleEmail = emailFromIdToken(data.id_token)

    await setDriveLinkDoc(uid, idToken, {
      enc: encryptSecret(data.refresh_token),
      googleEmail,
      scope: data.scope,
      linkedAt: new Date().toISOString(),
    })

    return NextResponse.json({ linked: true, googleEmail })
  } catch (error) {
    console.error('google-drive/link error:', error)
    return NextResponse.json({ error: 'Gagal menautkan Google Drive.' }, { status: 500 })
  }
}
