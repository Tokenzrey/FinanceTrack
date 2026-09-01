import { GoogleGenAI, Type } from '@google/genai'
import type { Category } from '@/shared/types/domain'
import type { BotIntent, ParsedIntent } from './types'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'

const READ_COMMANDS: { pattern: RegExp; intent: BotIntent }[] = [
  // `/?` accepts both the bare keyword ("ringkasan") and the Telegram slash-command
  // form ("/ringkasan") — command menu entries and old muscle-memory keywords both work.
  { pattern: /^\/?(ringkasan|summary)$/i, intent: 'get_summary' },
  { pattern: /^\/?(sisa|saldo)$/i, intent: 'get_balance' },
  { pattern: /^\/?(kategori|categories)$/i, intent: 'list_categories' },
  { pattern: /^\/?(riwayat|history)$/i, intent: 'get_recent' },
  { pattern: /^\/?(tahunan|year)$/i, intent: 'get_year_summary' },
  { pattern: /^\/?(target|goals?)$/i, intent: 'list_goals' },
  { pattern: /^\/?setor$/i, intent: 'contribute_goal' },
  { pattern: /^\/?(kekayaan|networth)$/i, intent: 'net_worth' },
  { pattern: /^\/?rutin$/i, intent: 'list_recurring' },
  { pattern: /^\/?wishlist$/i, intent: 'list_wishlist' },
  { pattern: /^\/?(batal|cancel)$/i, intent: 'cancel_pending' },
  { pattern: /^\/?(bantuan|help|start)$/i, intent: 'help' },
  { pattern: /^\/?putuskan$/i, intent: 'unlink' },
]

/**
 * Matches the fixed read-commands by plain keyword, before ever calling Gemini —
 * cheaper, faster, and immune to the model ever misreading a one-word command.
 */
export function matchReadCommand(text: string): BotIntent | null {
  const trimmed = text.trim()
  for (const { pattern, intent } of READ_COMMANDS) {
    if (pattern.test(trimmed)) return intent
  }
  return null
}

const schema = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, description: '"add_expense" atau "add_income"' },
    description: { type: Type.STRING, nullable: true },
    categoryCandidates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'id kategori paling cocok, urutan dari paling yakin, maksimal 3',
    },
    dateOffset: { type: Type.NUMBER, description: '0 = hari ini, -1 = kemarin, dst.' },
    confidence: { type: Type.NUMBER, description: 'bilangan bulat 0-100, seberapa yakin pada kandidat pertama' },
  },
  required: ['intent', 'categoryCandidates', 'confidence'],
}

function buildPrompt(text: string, categories: Category[]): string {
  return `
Kamu asisten pencatat keuangan personal via chat. Pesan ini SUDAH dipastikan berisi
transaksi (bukan perintah baca) — tugasmu memutuskan jenisnya dan kategori yang paling
cocok, BUKAN menentukan nominalnya (nominal ditangani terpisah, jangan disebut sama
sekali di jawabanmu).

Pesan: "${text}"

Kategori yang tersedia:
${JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })))}

Aturan:
- intent: "add_expense" untuk pengeluaran (ini default kalau tidak jelas), "add_income"
  hanya kalau jelas-jelas pemasukan (gaji, transfer masuk, bonus, dan sejenisnya)
- description: ringkasan singkat (nama barang/toko/aktivitas), atau null kalau tak ada
- categoryCandidates: 1-3 id kategori dari daftar di atas yang paling mungkin cocok,
  diurutkan dari paling yakin — array kosong kalau benar-benar tidak ada yang cocok.
  KHUSUS kalau intent "add_income": HARUS pilih dari kategori berpilar "income" saja.
  KHUSUS kalau intent "add_expense": JANGAN pilih kategori berpilar "income".
- dateOffset: 0 kalau tanggal tidak disebut atau disebut "hari ini"/"tadi", -1 kalau
  "kemarin", dan seterusnya
- confidence: 0-100, seberapa yakin kamu pada kandidat PERTAMA (bukan pada intent)
`.trim()
}

function normaliseConfidence(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

const FALLBACK: ParsedIntent = {
  intent: 'add_expense',
  description: null,
  categoryCandidates: [],
  dateOffset: 0,
  confidence: 0,
}

/**
 * Asks Gemini what a transaction-recording message means. Never throws — any failure
 * (missing key, network, malformed response) degrades to "record as an uncategorised
 * expense today", which the confirmation flow in `core.ts` then asks the user to
 * disambiguate rather than silently guessing wrong.
 */
export async function parseIntent(text: string, categories: Category[]): Promise<ParsedIntent> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return FALLBACK

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(text, categories),
      config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    })

    const raw = JSON.parse(response.text ?? '{}')
    const knownIds = new Set(categories.map((c) => c.id))
    const candidates = Array.isArray(raw.categoryCandidates)
      ? raw.categoryCandidates.filter((id: unknown): id is string => typeof id === 'string' && knownIds.has(id)).slice(0, 3)
      : []

    return {
      intent: raw.intent === 'add_income' ? 'add_income' : 'add_expense',
      description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
      categoryCandidates: candidates,
      dateOffset: Number.isFinite(raw.dateOffset) ? Math.trunc(raw.dateOffset) : 0,
      confidence: normaliseConfidence(raw.confidence),
    }
  } catch (error) {
    console.error('parseIntent error:', error)
    return FALLBACK
  }
}
