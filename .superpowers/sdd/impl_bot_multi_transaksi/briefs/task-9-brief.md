## Task 9: Alur Tulis — Teks & Struk Masuk ke Batch

Menyambungkan Task 2/4/5/8 jadi satu jalur. R3/R4/R5/R6 selesai di sini.

**Files:**
- Create: `src/shared/bot/flow-write.ts`
- Test: `src/shared/bot/flow-write.test.ts`
- Modify: `src/shared/bot/core.ts` (buang `handleText`/`handleImage`/`resolveCategoryOrAsk`/`finalizeTransaction`, delegasikan ke `flow-write`)

**Interfaces:**
- Consumes: `parseTransactionBatch` dari `./parse-batch`; `buildLinesFromParsed`, `buildLinesFromReceipt` dari `./draft`; `extractReceipt`, `isAiQuotaOrOverloadError`, `ALLOWED_MIME`, `MAX_BASE64_CHARS` dari `@/shared/lib/receipt-extraction`; `uploadReceiptForUser` dari `./drive-upload`; `startReview` dari `./flow-review`
- Produces:
  - `handleTextTransaction(userId: string, text: string): Promise<BotReply>`
  - `handlePhoto(userId: string, msg: Extract<BotIncoming, { kind: 'image' }>): Promise<BotReply>`

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/flow-write.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { BotIncoming, DraftBatch } from './types'

const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const createTransactionsBatch = vi.fn()
const rememberLastBatch = vi.fn()
const getUserTimezone = vi.fn()
const setPending = vi.fn()

vi.mock('./admin-data', () => ({
  findCategories: (...a: unknown[]) => findCategories(...a),
  getMonthlyBudget: (...a: unknown[]) => getMonthlyBudget(...a),
  isBudgetClosedAdmin: (...a: unknown[]) => isBudgetClosedAdmin(...a),
  createTransactionsBatch: (...a: unknown[]) => createTransactionsBatch(...a),
  rememberLastBatch: (...a: unknown[]) => rememberLastBatch(...a),
  getUserTimezone: (...a: unknown[]) => getUserTimezone(...a),
  setPending: (...a: unknown[]) => setPending(...a),
}))

const parseTransactionBatch = vi.fn()
vi.mock('./parse-batch', () => ({ parseTransactionBatch: (...a: unknown[]) => parseTransactionBatch(...a) }))

const extractReceipt = vi.fn()
vi.mock('@/shared/lib/receipt-extraction', () => ({
  extractReceipt: (...a: unknown[]) => extractReceipt(...a),
  isAiQuotaOrOverloadError: (e: unknown) => (e as { status?: number })?.status === 429,
  ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  MAX_BASE64_CHARS: 6 * 1024 * 1024,
}))

const uploadReceiptForUser = vi.fn()
vi.mock('./drive-upload', () => ({ uploadReceiptForUser: (...a: unknown[]) => uploadReceiptForUser(...a) }))

const { handlePhoto, handleTextTransaction } = await import('./flow-write')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar, percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}
const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-salary', 'Gaji', 'income')]

const parsed = (over = {}) => ({
  type: 'expense', description: 'makan siang', amountText: '35rb',
  categoryCandidates: ['c-food'], dateOffset: 0, confidence: 95, ...over,
})

const photo = (caption?: string): Extract<BotIncoming, { kind: 'image' }> => ({
  platform: 'whatsapp', externalId: '1', kind: 'image',
  imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg', caption,
})

function receiptResult(over = {}) {
  return {
    extraction: {
      merchant: 'Indomaret', merchantType: 'supermarket', date: null,
      items: [{ name: 'Nasi goreng', totalPrice: 35000 }, { name: 'Teh', totalPrice: 24000 }],
      subtotal: 59000, tax: null, serviceCharge: null, discount: null, total: 59000,
      currency: 'IDR', confidence: 88, rawText: '', language: 'id',
    },
    mappedItems: [
      { name: 'Nasi goreng', totalPrice: 35000, suggestedCategoryId: 'c-food', suggestedCategoryName: 'Makan', suggestedPillar: 'needs', mappingConfidence: 90, mappingReason: '', isManuallyMapped: false },
      { name: 'Teh', totalPrice: 24000, suggestedCategoryId: 'c-food', suggestedCategoryName: 'Makan', suggestedPillar: 'needs', mappingConfidence: 85, mappingReason: '', isManuallyMapped: false },
    ],
    totalConfidence: 88,
    warnings: [],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findCategories.mockResolvedValue(CATEGORIES)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  createTransactionsBatch.mockResolvedValue(['t1'])
  getUserTimezone.mockResolvedValue('Asia/Jakarta')
  uploadReceiptForUser.mockResolvedValue({ gDriveFileId: 'f1', gDriveWebViewLink: 'https://drive/f1' })
})

describe('handleTextTransaction', () => {
  it('records a single confident line immediately, no review card', async () => {
    parseTransactionBatch.mockResolvedValue([parsed()])
    const reply = await handleTextTransaction('u1', 'makan siang 35rb')
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('Tercatat')
  })

  it('opens a review card when the message yields more than one transaction', async () => {
    parseTransactionBatch.mockResolvedValue([parsed(), parsed({ amountText: '50rb', description: 'bensin' })])
    const reply = await handleTextTransaction('u1', 'makan 35rb, bensin 50rb')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tinjau 2 Transaksi')
  })

  it('opens a review card when the only line is low-confidence', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ confidence: 20 })])
    await handleTextTransaction('u1', 'itu tadi 35rb')
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(createTransactionsBatch).not.toHaveBeenCalled()
  })

  it('opens a review card when the only line has no category at all', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ categoryCandidates: [], confidence: 95 })])
    await handleTextTransaction('u1', 'entah apa 35rb')
    expect(setPending).toHaveBeenCalledTimes(1)
  })

  it('records income and transfer as their own types on the fast path', async () => {
    parseTransactionBatch.mockResolvedValue([
      parsed({ type: 'income', categoryCandidates: ['c-salary'], amountText: '5jt' }),
    ])
    await handleTextTransaction('u1', 'gaji masuk 5jt')
    expect(createTransactionsBatch.mock.calls[0][1][0].type).toBe('income')
  })

  it('asks for a number when nothing in the message parses as an amount', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ amountText: 'tidak ada angka' })])
    const reply = await handleTextTransaction('u1', 'halo apa kabar')
    expect(reply.text).toContain('Nominalnya tidak ketemu')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('refuses the fast path into a closed month', async () => {
    isBudgetClosedAdmin.mockReturnValue(true)
    parseTransactionBatch.mockResolvedValue([parsed()])
    const reply = await handleTextTransaction('u1', 'makan 35rb')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('sudah ditutup')
  })
})

describe('handlePhoto', () => {
  it('never writes straight away — a receipt always opens a review card', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    const reply = await handlePhoto('u1', photo())
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tinjau 2 Transaksi')
  })

  it('passes the caption to the extractor as context', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    await handlePhoto('u1', photo('yang buram itu teh botol 2x12rb'))
    expect(extractReceipt.mock.calls[0][4]).toBe('yang buram itu teh botol 2x12rb')
  })

  it('uploads the photo to Drive and attaches it to the draft', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    await handlePhoto('u1', photo())
    const draft = setPending.mock.calls[0][1] as DraftBatch
    expect(draft.receipt).toEqual({ gDriveFileId: 'f1', gDriveWebViewLink: 'https://drive/f1' })
  })

  it('still opens the review card when Drive is not linked', async () => {
    uploadReceiptForUser.mockResolvedValue(null)
    extractReceipt.mockResolvedValue(receiptResult())
    const reply = await handlePhoto('u1', photo())
    expect((setPending.mock.calls[0][1] as DraftBatch).receipt).toBeUndefined()
    expect(reply.text).toContain('Tinjau')
  })

  it('carries the extraction warnings into the draft so the card shows them', async () => {
    extractReceipt.mockResolvedValue(receiptResult({ warnings: ['Gambar kurang jelas.'] }))
    await handlePhoto('u1', photo())
    expect((setPending.mock.calls[0][1] as DraftBatch).warnings).toContain('Gambar kurang jelas.')
  })

  it('opens a one-line review card from the receipt total when no items were read', async () => {
    extractReceipt.mockResolvedValue(
      receiptResult({
        extraction: { ...receiptResult().extraction, items: [] },
        mappedItems: [],
      }),
    )
    const reply = await handlePhoto('u1', photo())
    const draft = setPending.mock.calls[0][1] as DraftBatch
    expect(draft.lines).toHaveLength(1)
    expect(draft.lines[0].amount).toBe(59000)
    expect(reply.text).toContain('Tinjau Transaksi')
  })

  it('reports a quota failure distinctly and writes nothing', async () => {
    extractReceipt.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }))
    const reply = await handlePhoto('u1', photo())
    expect(reply.text).toContain('kuota')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('rejects an oversized image before spending a model call', async () => {
    const reply = await handlePhoto('u1', { ...photo(), imageBase64: 'x'.repeat(7 * 1024 * 1024) })
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('terlalu besar')
  })

  it('rejects an unsupported mime type before spending a model call', async () => {
    const reply = await handlePhoto('u1', { ...photo(), mimeType: 'application/pdf' })
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('bukan foto struk')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/flow-write.test.ts`
Expected: FAIL — `Failed to resolve import "./flow-write"`.

- [ ] **Step 3: Implementasi `flow-write.ts`**

Buat `src/shared/bot/flow-write.ts`:

```ts
import {
  ALLOWED_MIME,
  MAX_BASE64_CHARS,
  extractReceipt,
  isAiQuotaOrOverloadError,
} from '@/shared/lib/receipt-extraction'
import type { Category } from '@/shared/types/domain'
import * as adminData from './admin-data'
import { batchToDTOs, buildLinesFromParsed, buildLinesFromReceipt, renumber } from './draft'
import { uploadReceiptForUser } from './drive-upload'
import { startReview } from './flow-review'
import { parseTransactionBatch } from './parse-batch'
import { replies } from './replies'
import type { BotIncoming, BotReply, DraftBatch, DraftLine } from './types'

/**
 * The write side: a chat message or a photo becomes a `DraftBatch`.
 *
 * A receipt ALWAYS opens the review card — the user asked for confirm-and-edit before
 * anything is recorded, and an OCR read of a crumpled photo is exactly the case where
 * that matters. A text message keeps the old one-step path, but only when it is
 * unambiguous: exactly one transaction, a confident category match. Anything else
 * (two transactions in one sentence, a shaky category guess) is worth one tap.
 */

/** Above this the model's top category guess is taken without asking. Unchanged from
 *  the previous single-transaction flow. */
const AUTO_ACCEPT_CONFIDENCE = 60

function base64ToBlob(base64: string, mimeType: string): Blob {
  return new Blob([Buffer.from(base64, 'base64')], { type: mimeType })
}

function newBatch(over: Partial<DraftBatch> & Pick<DraftBatch, 'source' | 'lines'>): DraftBatch {
  return {
    pendingKind: 'transaction_batch',
    mode: 'itemized',
    merchant: null,
    receiptTotal: null,
    warnings: [],
    ...over,
  }
}

/** One line, confident, categorised — the case that should still feel instant. */
function isFastPath(lines: DraftLine[]): boolean {
  return lines.length === 1 && lines[0].categoryId !== null
}

async function commitDirect(
  userId: string,
  batch: DraftBatch,
  categories: Category[],
): Promise<BotReply> {
  const dtos = batchToDTOs(batch, categories)
  if (dtos.length === 0) return replies.amountNotFound()

  const date = dtos[0].date
  const budget = await adminData.getMonthlyBudget(userId, date.getFullYear(), date.getMonth() + 1)
  if (adminData.isBudgetClosedAdmin(budget)) {
    return replies.monthClosed(date.getFullYear(), date.getMonth() + 1)
  }

  const ids = await adminData.createTransactionsBatch(userId, dtos)
  await adminData.rememberLastBatch(userId, ids)

  const tz = await adminData.getUserTimezone(userId)
  return replies.transactionRecorded(dtos[0].amount, batch.lines[0].categoryName ?? '', 'none', date, tz)
}

export async function handleTextTransaction(userId: string, text: string): Promise<BotReply> {
  const categories = await adminData.findCategories(userId)
  const active = categories.filter((c) => c.isActive)

  const parsed = await parseTransactionBatch(text, active)
  const lines = buildLinesFromParsed(parsed, active, new Date())

  // Every segment failed to yield an amount — the message simply has no number in it.
  if (lines.length === 0) return replies.amountNotFound()

  const topConfidence = parsed[0]?.confidence ?? 0
  if (isFastPath(lines) && topConfidence >= AUTO_ACCEPT_CONFIDENCE) {
    return commitDirect(userId, newBatch({ source: 'text', lines }), categories)
  }

  return startReview(userId, newBatch({ source: 'text', lines }))
}

export async function handlePhoto(
  userId: string,
  msg: Extract<BotIncoming, { kind: 'image' }>,
): Promise<BotReply> {
  if (msg.imageBase64.length > MAX_BASE64_CHARS) return replies.imageTooLarge()
  if (!ALLOWED_MIME.includes(msg.mimeType)) return replies.notAReceipt()

  const categories = await adminData.findCategories(userId)
  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  let result
  try {
    result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      [],
      // The caption is the only thing the model has that the photo does not: a person
      // who saw the paper. On a blurry or long receipt it is what recovers the lines
      // OCR drops.
      msg.caption,
    )
  } catch (error) {
    console.error('bot handlePhoto extractReceipt error:', error)
    if (isAiQuotaOrOverloadError(error)) return replies.aiUnavailable()
    return replies.genericError()
  }

  if (result.totalConfidence < 20 || result.extraction.total <= 0) return replies.notAReceipt()

  const now = new Date()
  let lines = buildLinesFromReceipt(result, categories, now)

  // The model read a total but no usable line items (common on a faded thermal print).
  // One line for the whole receipt is still worth confirming, and the user can split
  // it by hand from the card.
  if (lines.length === 0) {
    lines = renumber([
      {
        n: 0,
        type: 'expense',
        amount: Math.round(result.extraction.total),
        description: result.extraction.merchant ?? msg.caption ?? null,
        categoryId: null,
        categoryName: null,
        dateIso: now.toISOString(),
        options: spendCategories.slice(0, 4).map((c) => ({ categoryId: c.id, name: c.name })),
      },
    ])
  }

  const uploaded = await uploadReceiptForUser(
    userId,
    base64ToBlob(msg.imageBase64, msg.mimeType),
    `struk-${Date.now()}.jpg`,
  )

  return startReview(
    userId,
    newBatch({
      source: 'receipt',
      lines,
      merchant: result.extraction.merchant,
      receiptTotal: Math.round(result.extraction.total),
      warnings: result.warnings,
      receipt: uploaded ?? undefined,
    }),
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/flow-write.test.ts`
Expected: PASS (16 test).

- [ ] **Step 5: Rampingkan `core.ts`**

Hapus dari `src/shared/bot/core.ts`: `handleText`, `handleImage`, `resolveCategoryOrAsk`, `finalizeTransaction`, `rankCandidateCategories`, `candidateConfidence`, `base64ToBlob`, `interface Draft`, dan konstanta `AUTO_ACCEPT_CONFIDENCE`. Ganti dua baris terakhir `handleIncoming` menjadi:

```ts
  if (msg.kind === 'image') return handlePhoto(userId, msg)

  const trimmed = msg.text.trim()
  if (!trimmed) return replies.unknownMessage()

  const readCommand = matchReadCommand(trimmed)
  if (readCommand) return handleReadCommand(userId, readCommand)

  return handleTextTransaction(userId, trimmed)
```

Tambahkan `import { handlePhoto, handleTextTransaction } from './flow-write'`, dan buang impor yang tidak lagi terpakai (`extractReceipt`, `parseAmount`, `parseIntent`, `uploadReceiptForUser`, `MappedReceiptItem`, dst.).

- [ ] **Step 6: Rapikan test lama & jalankan semuanya**

Di `core.test.ts`, hapus blok `describe('handleIncoming — photos')` dan blok yang menguji konfirmasi kategori satu-transaksi — perilakunya kini milik `flow-write.test.ts` dan `flow-review.test.ts`. Pertahankan test penautan akun, `unlink:*`, `skip_recurring:*`, dan semua perintah baca.

Run: `npx vitest run && npx tsc --noEmit && npx next lint --dir src`
Expected: PASS, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/bot/flow-write.ts src/shared/bot/flow-write.test.ts src/shared/bot/core.ts src/shared/bot/core.test.ts
git commit -m "feat(bot): one message or one receipt becomes a reviewable batch

A receipt now always opens the review card — an OCR read of a crumpled photo is
exactly the case worth confirming, and the caption rides along as extraction context.
A receipt whose total was read but whose items were not still produces one line, so a
faded thermal print is recoverable by hand instead of rejected.

Text keeps the instant path, but only when it is unambiguous: exactly one transaction
with a confident category. Two transactions in one sentence, or a shaky guess, is
worth one tap.

core.ts is now a dispatcher; the write paths live in flow-write.ts and flow-review.ts."
```

---

