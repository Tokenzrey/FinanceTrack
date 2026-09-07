import { Type } from '@google/genai'
import { generateWithRouter } from '@/shared/lib/gemini-router'
import type { Category } from '@/shared/types/domain'
import type { BotTxType, ParsedLine } from './types'

/**
 * Splits one chat message into however many transactions it actually describes —
 * "makan siang 35rb, bensin 50rb, gaji masuk 5jt" is three, not one.
 *
 * The model never returns a number. It returns `amountText`: the literal substring it
 * believes carries the nominal, copied out of the user's own message. `draft.ts` then
 * runs that substring through `parseAmount`, the same deterministic parser the
 * single-transaction path has always used. A misread amount is the most expensive and
 * least noticeable failure a finance bot can have, so the model is kept away from it.
 *
 * Never throws: a quota error, a missing key, or a malformed answer all degrade to one
 * fallback line covering the whole message, which the review card then asks the user
 * to correct.
 */

/** A year back is already far past anything a chat message plausibly means. */
const MAX_DATE_OFFSET_DAYS = 365

const schema = {
  type: Type.OBJECT,
  properties: {
    lines: {
      type: Type.ARRAY,
      description: 'satu entri per transaksi yang disebut di pesan',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: '"expense", "income", atau "transfer"' },
          description: { type: Type.STRING, nullable: true },
          amountText: {
            type: Type.STRING,
            description: 'potongan teks PERSIS dari pesan yang memuat nominal transaksi ini',
          },
          categoryCandidates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'id kategori paling cocok, urut dari paling yakin, maks 3',
          },
          dateOffset: { type: Type.NUMBER, description: '0 = hari ini, -1 = kemarin' },
          confidence: { type: Type.NUMBER, description: 'bilangan bulat 0-100 untuk kandidat pertama' },
        },
        required: ['type', 'amountText', 'categoryCandidates', 'confidence'],
      },
    },
  },
  required: ['lines'],
}

function buildPrompt(text: string, categories: Category[]): string {
  return `
Kamu asisten pencatat keuangan personal via chat. Pecah pesan berikut menjadi SEMUA
transaksi yang disebutkan — satu pesan bisa memuat lebih dari satu transaksi.

Pesan: "${text}"

Kategori yang tersedia:
${JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })))}

Aturan:
- Satu entri "lines" untuk SETIAP transaksi. Kalau pesan hanya memuat satu, kembalikan satu.
- type: "expense" (default kalau tidak jelas), "income" kalau jelas pemasukan (gaji,
  transfer masuk, bonus), "transfer" kalau jelas pemindahan dana antar kantong/rekening
  milik sendiri (mis. "pindah ke BCA", "tarik tunai", "top up e-wallet").
- amountText: SALIN PERSIS potongan teks dari pesan yang memuat nominal transaksi itu,
  apa adanya, termasuk satuannya. Contoh: "35rb", "Rp250.000", "1,5jt".
  JANGAN menghitung, membulatkan, atau menulis ulang angkanya dalam bentuk lain.
- description: ringkasan singkat (nama barang/toko/aktivitas), atau null.
- categoryCandidates: 1-3 id kategori dari daftar di atas, urut dari paling yakin.
  Array kosong kalau tidak ada yang cocok.
  Kalau type "income": HANYA kategori berpilar "income".
  Kalau type "expense": JANGAN kategori berpilar "income".
- dateOffset: 0 kalau tanggal tidak disebut atau "hari ini", -1 kalau "kemarin", dst.
- confidence: 0-100, keyakinan pada kandidat PERTAMA.
`.trim()
}

function toTxType(raw: unknown): BotTxType {
  if (raw === 'income' || raw === 'transfer') return raw
  return 'expense'
}

function clampOffset(raw: unknown): number {
  if (!Number.isFinite(raw)) return 0
  const value = Math.trunc(raw as number)
  return Math.max(-MAX_DATE_OFFSET_DAYS, Math.min(MAX_DATE_OFFSET_DAYS, value))
}

function clampConfidence(raw: unknown): number {
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(100, Math.round(raw as number)))
}

/** One line covering the whole message, no category guess — the review card will ask. */
function fallback(text: string): ParsedLine[] {
  return [
    { type: 'expense', description: null, amountText: text, categoryCandidates: [], dateOffset: 0, confidence: 0 },
  ]
}

export async function parseTransactionBatch(text: string, categories: Category[]): Promise<ParsedLine[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fallback(text)

  try {
    const response = await generateWithRouter('text', {
      contents: buildPrompt(text, categories),
      config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    })

    const raw = JSON.parse(response.text ?? '{}') as { lines?: unknown }
    if (!Array.isArray(raw.lines) || raw.lines.length === 0) return fallback(text)

    const knownIds = new Set(categories.map((c) => c.id))
    const lines = (raw.lines as Record<string, unknown>[]).map<ParsedLine>((item) => ({
      type: toTxType(item.type),
      description:
        typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null,
      // Coerced to string on purpose: whatever shape the model answered in, only the
      // deterministic parser downstream is allowed to turn it into a number.
      amountText: String(item.amountText ?? ''),
      categoryCandidates: Array.isArray(item.categoryCandidates)
        ? (item.categoryCandidates as unknown[])
            .filter((id): id is string => typeof id === 'string' && knownIds.has(id))
            .slice(0, 3)
        : [],
      dateOffset: clampOffset(item.dateOffset),
      confidence: clampConfidence(item.confidence),
    }))

    return lines.length > 0 ? lines : fallback(text)
  } catch (error) {
    console.error('parseTransactionBatch error:', error instanceof Error ? error.message : error)
    return fallback(text)
  }
}
