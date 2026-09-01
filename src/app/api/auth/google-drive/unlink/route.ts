import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { getDriveLinkDoc, deleteDriveLinkDoc } from '@/shared/lib/firestore-rest'
import { decryptSecret } from '@/shared/lib/token-crypto'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const idToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!idToken) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  let uid: string
  try {
    ;({ uid } = await verifyFirebaseIdToken(idToken))
  } catch {
    return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 })
  }

  try {
    // Best-effort: also revoke at Google so the grant disappears from the user's
    // "Third-party apps" list, not just from our own storage.
    const doc = await getDriveLinkDoc(uid, idToken)
    if (doc) {
      const refreshToken = decryptSecret(doc.enc)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
      }).catch(() => {})
    }

    await deleteDriveLinkDoc(uid, idToken)
    return NextResponse.json({ linked: false })
  } catch (error) {
    console.error('google-drive/unlink error:', error)
    return NextResponse.json({ error: 'Gagal memutuskan tautan Google Drive.' }, { status: 500 })
  }
}
