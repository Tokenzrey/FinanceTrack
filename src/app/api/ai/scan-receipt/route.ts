import { GoogleGenAI, Type } from '@google/genai'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import type {
  ExtractedReceiptItem,
  MappedReceiptItem,
  ReceiptExtraction,
  ReceiptScanResult,
  ScanReceiptApiRequest,
} from '@/shared/types/receipt-scanner.types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * `gemini-1.5-flash` from the plan has been retired and is no longer served.
 * `gemini-3.5-flash` is the current stable flash model — verified against this
 * project's key. Override with GEMINI_MODEL if a newer one is preferred.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'

/** Base64 of a compressed receipt. Anything larger is a mis-sized upload, not a receipt. */
const MAX_BASE64_CHARS = 6 * 1024 * 1024

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

const EXTRACTION_PROMPT = `
Kamu adalah AI yang ahli membaca struk belanja/kwitansi, terutama dari Indonesia.

Ekstrak informasi dari gambar struk ini. Jika suatu field tidak ditemukan, gunakan null.
Semua harga dalam IDR (Rupiah), sebagai angka murni tanpa pemisah.

Catatan penting:
- Hapus titik pemisah ribuan Indonesia (1.500 menjadi 1500)
- Qty bisa ditulis "1x", "2 pcs", "3 bh" — ambil angkanya saja
- confidence adalah bilangan bulat 0 sampai 100 (BUKAN 0 sampai 1)
- Jika gambar buram, tercoret, atau gelap, beri confidence rendah
- Jika gambar ini JELAS BUKAN struk belanja (misalnya foto orang, pemandangan,
  atau tangkapan layar acak), set confidence di bawah 20 dan items array kosong
- Jika total tidak terbaca, estimasi dari penjumlahan item
`.trim()

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING, nullable: true },
    merchantType: {
      type: Type.STRING,
      nullable: true,
      description: 'supermarket|restaurant|pharmacy|cafe|transport|fashion|electronics|other',
    },
    date: { type: Type.STRING, nullable: true, description: 'format YYYY-MM-DD' },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER, nullable: true },
          unitPrice: { type: Type.NUMBER, nullable: true },
          totalPrice: { type: Type.NUMBER },
          rawText: { type: Type.STRING, nullable: true },
        },
        required: ['name', 'totalPrice'],
      },
    },
    subtotal: { type: Type.NUMBER, nullable: true },
    tax: { type: Type.NUMBER, nullable: true },
    serviceCharge: { type: Type.NUMBER, nullable: true },
    discount: { type: Type.NUMBER, nullable: true },
    total: { type: Type.NUMBER },
    confidence: { type: Type.NUMBER, description: 'bilangan bulat 0-100' },
    language: { type: Type.STRING, description: 'id, en, atau mixed' },
    rawText: { type: Type.STRING },
  },
  required: ['items', 'total', 'confidence'],
}

const mappingSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      itemIndex: { type: Type.NUMBER },
      categoryId: { type: Type.STRING, nullable: true },
      confidence: { type: Type.NUMBER, description: 'bilangan bulat 0-100' },
      reason: { type: Type.STRING },
    },
    required: ['itemIndex', 'confidence'],
  },
}

/** The model answers 0–1 as often as 0–100; normalise so thresholds mean one thing. */
function normaliseConfidence(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const scaled = n > 0 && n <= 1 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

function buildMappingPrompt(
  items: ExtractedReceiptItem[],
  categories: ScanReceiptApiRequest['categories'],
  merchantType: string | null,
  hints: ScanReceiptApiRequest['hints'],
): string {
  const hintLines = hints
    .map((hint) => {
      const category = categories.find((c) => c.id === hint.categoryId)
      return category ? `- "${hint.keyword}" selalu ke "${category.name}"` : null
    })
    .filter(Boolean)

  return `
Kamu adalah AI keuangan personal. Petakan setiap item belanja ke kategori keuangan user.

Kategori yang tersedia:
${JSON.stringify(categories, null, 2)}

Tipe merchant: ${merchantType ?? 'tidak diketahui'}

Item belanja:
${JSON.stringify(
  items.map((item, index) => ({ index, name: item.name, price: item.totalPrice })),
  null,
  2,
)}
${hintLines.length > 0 ? `\nPreferensi user yang sudah dipelajari (PRIORITASKAN ini):\n${hintLines.join('\n')}` : ''}

Aturan mapping:
- Makanan/minuman dari supermarket ke kategori bahan makanan harian
- Makanan di restoran/kafe ke kategori kuliner
- Obat, vitamin ke kategori kesehatan
- Bensin, parkir, tol ke kategori transportasi
- categoryId HARUS salah satu id di daftar kategori di atas, atau null
- Jika tidak yakin, confidence di bawah 60 dan categoryId null
- reason: alasan singkat dalam bahasa Indonesia
`.trim()
}

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

  const ai = new GoogleGenAI({ apiKey })

  try {
    // 3. Extract the receipt. One retry: the flash models return a transient 503
    //    under load, and a single retry turns that into a slow success, not a failure.
    const extractionResponse = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: [{ text: EXTRACTION_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: extractionSchema,
          temperature: 0,
        },
      }),
    )

    const raw = JSON.parse(extractionResponse.text ?? '{}')

    const extraction: ReceiptExtraction = {
      merchant: raw.merchant ?? null,
      merchantType: raw.merchantType ?? null,
      date: raw.date ?? null,
      items: Array.isArray(raw.items) ? raw.items : [],
      subtotal: raw.subtotal ?? null,
      tax: raw.tax ?? null,
      serviceCharge: raw.serviceCharge ?? null,
      discount: raw.discount ?? null,
      total: typeof raw.total === 'number' ? raw.total : 0,
      currency: 'IDR',
      confidence: normaliseConfidence(raw.confidence),
      rawText: raw.rawText ?? '',
      language: ['id', 'en', 'mixed'].includes(raw.language) ? raw.language : 'id',
    }

    // 4. Map items to categories. Skipped when the user has no categories yet, or
    //    when the image clearly is not a receipt — no point spending a second call.
    let mappings: {
      itemIndex: number
      categoryId?: string | null
      confidence: number
      reason?: string
    }[] = []

    const worthMapping =
      extraction.items.length > 0 && categories.length > 0 && extraction.confidence >= 20

    if (worthMapping) {
      try {
        const mappingResponse = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents: buildMappingPrompt(
              extraction.items,
              categories,
              extraction.merchantType,
              hints,
            ),
            config: {
              responseMimeType: 'application/json',
              responseSchema: mappingSchema,
              temperature: 0,
            },
          }),
        )
        const parsed = JSON.parse(mappingResponse.text ?? '[]')
        if (Array.isArray(parsed)) mappings = parsed
      } catch {
        // Mapping is an enhancement — a failure here still leaves a usable extraction.
        mappings = []
      }
    }

    const knownIds = new Set(categories.map((c) => c.id))

    const mappedItems: MappedReceiptItem[] = extraction.items.map((item, index) => {
      const mapping = mappings.find((m) => m.itemIndex === index)
      // The model can invent an id; only accept ones the user actually owns.
      const categoryId =
        mapping?.categoryId && knownIds.has(mapping.categoryId) ? mapping.categoryId : null
      const category = categories.find((c) => c.id === categoryId)

      return {
        ...item,
        suggestedCategoryId: categoryId,
        suggestedCategoryName: category?.name ?? null,
        suggestedPillar: category?.pillar ?? null,
        mappingConfidence: categoryId ? normaliseConfidence(mapping?.confidence) : 0,
        mappingReason: mapping?.reason ?? '',
        isManuallyMapped: false,
      }
    })

    // 5. Sanity checks the reviewer should see.
    const warnings: string[] = []
    const sumItems = mappedItems.reduce((sum, item) => sum + item.totalPrice, 0)

    if (extraction.confidence < 20) {
      warnings.push('Sepertinya ini bukan struk belanja, atau gambarnya terlalu tidak jelas.')
    } else if (extraction.confidence < 50) {
      warnings.push('Gambar kurang jelas — periksa setiap angka sebelum menyimpan.')
    }

    if (extraction.total === 0) {
      warnings.push('Total tidak terbaca — isi manual sebelum menyimpan.')
    } else if (mappedItems.length > 0 && Math.abs(sumItems - extraction.total) > 500) {
      warnings.push(
        `Total struk (${extraction.total}) tidak cocok dengan jumlah item (${sumItems}). Mungkin ada item yang tidak terbaca.`,
      )
    }

    if (categories.length === 0) {
      warnings.push('Belum ada kategori — tambahkan di Master Data agar mapping otomatis berjalan.')
    }

    return NextResponse.json({
      extraction,
      mappedItems,
      totalConfidence: extraction.confidence,
      warnings,
    } satisfies ReceiptScanResult)
  } catch (error) {
    console.error('scan-receipt error:', error)
    return NextResponse.json(
      { error: 'Scan AI sedang tidak tersedia. Gambar tetap tersimpan — coba lagi nanti.' },
      { status: 502 },
    )
  }
}

/** One automatic retry, as the plan's error handling specifies. */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 800))
    return operation()
  }
}
