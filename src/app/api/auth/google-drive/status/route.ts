import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { getDriveLinkDoc } from '@/shared/lib/firestore-rest'

export const runtime = 'nodejs'

/** Cheap status check — no Google API call, just "does a link record exist". */
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  let uid: string
  try {
    ;({ uid } = await verifyFirebaseIdToken(token))
  } catch {
    return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 })
  }

  try {
    const doc = await getDriveLinkDoc(uid, token)
    return NextResponse.json({ linked: Boolean(doc), googleEmail: doc?.googleEmail ?? null })
  } catch (error) {
    console.error('google-drive/status error:', error)
    return NextResponse.json({ error: 'Gagal memeriksa status tautan.' }, { status: 500 })
  }
}
