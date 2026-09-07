## Task 4: Parse Multi-Transaksi dari Satu Pesan Teks

R3. Gemini memecah pesan; nominal tetap milik `parse-amount.ts` (§2 D1).

**Files:**
- Create: `src/shared/bot/parse-batch.ts`
- Test: `src/shared/bot/parse-batch.test.ts`

**Interfaces:**
- Consumes: `Category` dari `@/shared/types/domain`; `ParsedLine` dari `./types`; `isAiQuotaOrOverloadError` dari `@/shared/lib/receipt-extraction`
- Produces: `parseTransactionBatch(text: string, categories: Category[]): Promise<ParsedLine[]>` — **tidak pernah throw**; kegagalan apa pun berdegradasi jadi satu baris fallback

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/parse-batch.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'

const generateContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: {
    models: { generateContent: typeof generateContent }
  }) {
    this.models = { generateContent }
  }),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}))

const { parseTransactionBatch } = await import('./parse-batch')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id,
    name,
    pillar,
    percentOfIncome: 0,
    color: '#000',
    icon: 'star',
    isSinkingFund: false,
    isRecurring: false,
    isActive: true,
    order: 0,
    createdAt: null as never,
    updatedAt: null as never,
  }
}

const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-salary', 'Gaji', 'income')]

const originalKey = process.env.GEMINI_API_KEY

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key'
  generateContent.mockReset()
})

afterEach(() => {
  process.env.GEMINI_API_KEY = originalKey
})

function modelReply(lines: unknown[]) {
  return { text: JSON.stringify({ lines }) }
}

describe('parseTransactionBatch', () => {
  it('returns one ParsedLine per segment the model found', async () => {
    generateContent.mockResolvedValueOnce(
      modelReply([
        { type: 'expense', description: 'makan siang', amountText: '35rb', categoryCandidates: ['c-food'], dateOffset: 0, confidence: 92 },
        { type: 'income', description: 'gaji', amountText: '5jt', categoryCandidates: ['c-salary'], dateOffset: 0, confidence: 95 },
      ]),
    )

    const out = await parseTransactionBatch('makan siang 35rb, gaji masuk 5jt', CATEGORIES)
    expect(out).toHaveLength(2)
    expect(out[0].type).toBe('expense')
    expect(out[1].type).toBe('income')
    expect(out[1].amountText).toBe('5jt')
  })

  it('keeps transfer as its own type', async () => {
    generateContent.mockResolvedValueOnce(
      modelReply([{ type: 'transfer', description: 'pindah ke bca', amountText: '1jt', categoryCandidates: [], dateOffset: 0, confidence: 80 }]),
    )
    const out = await parseTransactionBatch('pindah ke bca 1jt', CATEGORIES)
    expect(out[0].type).toBe('transfer')
  })

  it('drops category ids the user does not actually own', async () => {
    generateContent.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: '10rb', categoryCandidates: ['made-up', 'c-food'], dateOffset: 0, confidence: 70 }]),
    )
    const out = await parseTransactionBatch('x 10rb', CATEGORIES)
    expect(out[0].categoryCandidates).toEqual(['c-food'])
  })

  it('never lets a numeric field from the model become the amount', async () => {
    // The model is told to return a substring; if it returns junk, the line still only
    // carries text — `draft.ts` re-parses it and drops the line when it cannot.
    generateContent.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: 99999, categoryCandidates: [], dateOffset: 0, confidence: 50 }]),
    )
    const out = await parseTransactionBatch('x sekian', CATEGORIES)
    expect(typeof out[0].amountText).toBe('string')
  })

  it('falls back to one whole-message line when the model call fails', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }))

    const out = await parseTransactionBatch('makan siang 35rb', CATEGORIES)
    expect(out).toEqual([
      { type: 'expense', description: null, amountText: 'makan siang 35rb', categoryCandidates: [], dateOffset: 0, confidence: 0 },
    ])
  })

  it('falls back the same way when GEMINI_API_KEY is missing, without calling the SDK', async () => {
    delete process.env.GEMINI_API_KEY
    const out = await parseTransactionBatch('kopi 20rb', CATEGORIES)
    expect(out).toHaveLength(1)
    expect(out[0].amountText).toBe('kopi 20rb')
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('falls back when the model answers with an empty or malformed lines array', async () => {
    generateContent.mockResolvedValueOnce(modelReply([]))
    expect((await parseTransactionBatch('kopi 20rb', CATEGORIES))[0].amountText).toBe('kopi 20rb')

    generateContent.mockResolvedValueOnce({ text: 'not json at all' })
    expect((await parseTransactionBatch('kopi 20rb', CATEGORIES))[0].amountText).toBe('kopi 20rb')
  })

  it('clamps dateOffset and confidence into sane ranges', async () => {
    generateContent.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: '10rb', categoryCandidates: [], dateOffset: -9999, confidence: 5000 }]),
    )
    const out = await parseTransactionBatch('x 10rb', CATEGORIES)
    expect(out[0].dateOffset).toBe(-365)
    expect(out[0].confidence).toBe(100)
  })

  it('defaults an unrecognised type to expense', async () => {
    generateContent.mockResolvedValueOnce(
      modelReply([{ type: 'donation', description: 'x', amountText: '10rb', categoryCandidates: [], dateOffset: 0, confidence: 50 }]),
    )
    expect((await parseTransactionBatch('x 10rb', CATEGORIES))[0].type).toBe('expense')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/parse-batch.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-batch"`.

- [ ] **Step 3: Implementasi `parse-batch.ts`**

Buat `src/shared/bot/parse-batch.ts`:

```ts
import { GoogleGenAI, Type } from '@google/genai'
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

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'

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
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
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
    console.error('parseTransactionBatch error:', error)
    return fallback(text)
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/parse-batch.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Typecheck & commit**

```bash
npx tsc --noEmit
git add src/shared/bot/parse-batch.ts src/shared/bot/parse-batch.test.ts
git commit -m "feat(bot): split one chat message into many transactions

Gemini segments the message and returns amountText — the literal substring from the
user's own words — never a number. parseAmount turns that into the figure, exactly
as the single-transaction path always did.

transfer becomes reachable for the first time: the old flow derived type from the
category pillar, which could only ever produce income or expense.

Never throws. Missing key, quota error, or malformed answer all degrade to a single
whole-message line that the review card asks the user to fix."
```

---

