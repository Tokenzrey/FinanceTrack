import {
  GoogleGenAI,
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai'
import type {
  ExtractedReceiptItem,
  MappedReceiptItem,
  ReceiptExtraction,
  ReceiptScanResult,
  ScanReceiptApiRequest,
} from '@/shared/types/receipt-scanner.types'

/**
 * The Gemini-calling core of receipt scanning — moved out of
 * `/api/ai/scan-receipt/route.ts` unchanged (prompt, schema, retry, and warning logic
 * are exactly what that route already had) so the bot's photo-in-chat feature can call
 * it directly, server-to-server, instead of duplicating a second copy of this prompt.
 * The route keeps its own auth check and payload validation — only the part that
 * actually talks to Gemini moved.
 */

/**
 * Models tried in order. The free tier meters requests *per model per day* (e.g. 20/day
 * for some newer flash models), so when the primary's daily quota is spent — or it's
 * momentarily overloaded (503) — the call falls through to the next candidate instead
 * of failing the whole feature. `GEMINI_MODEL` overrides the primary; the rest stay as
 * fallbacks. Duplicates (if the override equals a fallback) are collapsed.
 *
 * `gemini-1.5-flash` from the original plan has been retired and is no longer served.
 */
const MODELS: string[] = [
  process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
].filter((m, i, arr) => m && arr.indexOf(m) === i)

/** Base64 of a compressed receipt. Anything larger is a mis-sized upload, not a receipt. */
export const MAX_BASE64_CHARS = 6 * 1024 * 1024

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

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

/** The numeric HTTP status on a `@google/genai` ApiError (`429`, `503`, …), if any. */
function aiErrorStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : undefined
}

/**
 * True for the two Gemini failures the caller should treat as "try again later, this
 * isn't broken": 429 RESOURCE_EXHAUSTED (rate limit / daily free-tier quota) and 503
 * UNAVAILABLE (model overloaded). Checks the numeric status first, then the message
 * body for SDK paths that only surface it there.
 */
export function isAiQuotaOrOverloadError(err: unknown): boolean {
  const status = aiErrorStatus(err)
  if (status === 429 || status === 503) return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|"code":\s*(?:429|503)\b/.test(msg)
}

/** One automatic retry for transient failures (503 overload, network blips): a single
 *  retry turns those into a slow success. A 429 is NOT retried — a daily quota won't
 *  clear in 800ms and an immediate retry just burns another request against a small
 *  free-tier limit. */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (err) {
    if (aiErrorStatus(err) === 429) throw err
    await new Promise((resolve) => setTimeout(resolve, 800))
    return operation()
  }
}

/**
 * Runs one generateContent request, walking `MODELS` in order: the primary gets the
 * `withRetry` transient-503 retry, each fallback gets a single attempt. Any error —
 * quota (429), overload (503), or a model id this key cannot use — falls through to
 * the next candidate; the last error is rethrown once every candidate is exhausted, so
 * a genuine failure (unreadable image, bad key) still surfaces to the caller.
 */
async function generateWithModels(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, 'model'>,
): Promise<GenerateContentResponse> {
  let lastErr: unknown
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]
    try {
      const call = () => ai.models.generateContent({ model, ...params })
      return i === 0 ? await withRetry(call) : await call()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/**
 * Extracts a receipt and maps its items to categories. Assumes the caller has already
 * checked `GEMINI_API_KEY` is set and the image passed size/format validation — see
 * `MAX_BASE64_CHARS`/`ALLOWED_MIME` above, which both callers (the web route and the
 * bot) validate against before ever reaching this function.
 */
export async function extractReceipt(
  imageBase64: string,
  mimeType: string,
  categories: ScanReceiptApiRequest['categories'],
  hints: ScanReceiptApiRequest['hints'],
): Promise<ReceiptScanResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi.')

  const ai = new GoogleGenAI({ apiKey })

  // 1. Extract the receipt.
  const extractionResponse = await generateWithModels(ai, {
    contents: [{ text: EXTRACTION_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
    config: { responseMimeType: 'application/json', responseSchema: extractionSchema, temperature: 0 },
  })

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

  // 2. Map items to categories. Skipped when the user has no categories yet, or when
  //    the image clearly is not a receipt — no point spending a second call.
  let mappings: { itemIndex: number; categoryId?: string | null; confidence: number; reason?: string }[] = []

  const worthMapping = extraction.items.length > 0 && categories.length > 0 && extraction.confidence >= 20

  if (worthMapping) {
    try {
      const mappingResponse = await generateWithModels(ai, {
        contents: buildMappingPrompt(extraction.items, categories, extraction.merchantType, hints),
        config: { responseMimeType: 'application/json', responseSchema: mappingSchema, temperature: 0 },
      })
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
    const categoryId = mapping?.categoryId && knownIds.has(mapping.categoryId) ? mapping.categoryId : null
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

  // 3. Sanity checks the reviewer should see.
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

  return {
    extraction,
    mappedItems,
    totalConfidence: extraction.confidence,
    warnings,
  } satisfies ReceiptScanResult
}
