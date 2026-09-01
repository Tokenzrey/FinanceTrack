import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { ALLOWED_MIME, MAX_BASE64_CHARS, extractReceipt } from '@/shared/lib/receipt-extraction'
import type { ScanReceiptApiRequest } from '@/shared/types/receipt-scanner.types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY belum dikonfigurasi.' }, { status: 503 })
  }

  // 1. Authenticate. Without this the route is an open, billable proxy to Gemini.
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  }

  try {
    await verifyFirebaseIdToken(token)
  } catch {
    return NextResponse.json(
      { error: 'Sesi tidak valid. Masuk ulang lalu coba lagi.' },
      { status: 401 },
    )
  }

  // 2. Validate the payload before spending a model call on it.
  let body: ScanReceiptApiRequest
  try {
    body = (await request.json()) as ScanReceiptApiRequest
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }

  const { imageBase64, mimeType, categories = [], hints = [] } = body

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'Gambar struk tidak ditemukan.' }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: 'Gambar terlalu besar. Kompres dulu sebelum dikirim.' },
      { status: 413 },
    )
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json({ error: 'Format gambar tidak didukung.' }, { status: 400 })
  }

  try {
    const result = await extractReceipt(imageBase64, mimeType, categories, hints)
    return NextResponse.json(result)
  } catch (error) {
    console.error('scan-receipt error:', error)
    return NextResponse.json(
      { error: 'Scan AI sedang tidak tersedia. Gambar tetap tersimpan — coba lagi nanti.' },
      { status: 502 },
    )
  }
}
