## Task 2: Model Draft Batch

Inti R3/R4. Semua fungsi murni — tanpa Firestore, tanpa Gemini, tanpa jam sistem tersembunyi (waktu selalu diinjeksi).

**Files:**
- Modify: `src/shared/bot/types.ts` (tambah `BotTxType`, `DraftLine`, `DraftBatch`, `ParsedLine` — persis seperti §4)
- Create: `src/shared/bot/draft.ts`
- Test: `src/shared/bot/draft.test.ts`

**Interfaces:**
- Consumes: `parseAmount` dari `./parse-amount`; `Category` dari `@/shared/types/domain`; `ReceiptScanResult`, `MappedReceiptItem` dari `@/shared/types/receipt-scanner.types`; `CreateTransactionDTO` dari `@/shared/types/dto`
- Produces:
  - `MAX_DRAFT_LINES: number` (= 20)
  - `renumber(lines: DraftLine[]): DraftLine[]`
  - `buildLinesFromParsed(parsed: ParsedLine[], categories: Category[], now: Date): DraftLine[]`
  - `buildLinesFromReceipt(result: ReceiptScanResult, categories: Category[], now: Date): DraftLine[]`
  - `batchTotals(batch: DraftBatch): { expense: number; income: number; transfer: number; net: number }`
  - `collapseToSingle(batch: DraftBatch): DraftLine`
  - `batchToDTOs(batch: DraftBatch, categories?: Category[]): CreateTransactionDTO[]`

- [ ] **Step 1: Tambah tipe ke `types.ts`**

Tempel blok `BotTxType` / `DraftLine` / `DraftBatch` / `ParsedLine` dari §4 ke `src/shared/bot/types.ts`, setelah `BotIncoming` dan sebelum `BotKeyboardButton`.

- [ ] **Step 2: Tulis test yang gagal**

Buat `src/shared/bot/draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import {
  batchToDTOs,
  batchTotals,
  buildLinesFromParsed,
  buildLinesFromReceipt,
  collapseToSingle,
  renumber,
} from './draft'
import type { DraftBatch, DraftLine, ParsedLine } from './types'

const NOW = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))

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

const CATEGORIES = [
  cat('c-food', 'Makan & Minum', 'needs'),
  cat('c-transport', 'Transportasi', 'needs'),
  cat('c-salary', 'Gaji', 'income'),
]

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    n: 1,
    type: 'expense',
    amount: 35000,
    description: 'kopi',
    categoryId: 'c-food',
    categoryName: 'Makan & Minum',
    dateIso: NOW.toISOString(),
    options: [],
    ...over,
  }
}

function batch(over: Partial<DraftBatch> = {}): DraftBatch {
  return {
    pendingKind: 'transaction_batch',
    source: 'text',
    lines: [line()],
    mode: 'itemized',
    merchant: null,
    receiptTotal: null,
    warnings: [],
    ...over,
  }
}

describe('renumber', () => {
  it('closes the gap after a middle line is removed', () => {
    const out = renumber([line({ n: 1 }), line({ n: 3 })])
    expect(out.map((l) => l.n)).toEqual([1, 2])
  })
})

describe('buildLinesFromParsed', () => {
  const parsed = (over: Partial<ParsedLine> = {}): ParsedLine => ({
    type: 'expense',
    description: 'makan siang',
    amountText: '35rb',
    categoryCandidates: ['c-food'],
    dateOffset: 0,
    confidence: 90,
    ...over,
  })

  it('re-parses the amount from the model text instead of trusting a number', () => {
    const [l] = buildLinesFromParsed([parsed({ amountText: '1,5jt' })], CATEGORIES, NOW)
    expect(l.amount).toBe(1_500_000)
  })

  it('shifts the date by dateOffset days', () => {
    const [l] = buildLinesFromParsed([parsed({ dateOffset: -1 })], CATEGORIES, NOW)
    expect(l.dateIso).toBe(new Date(Date.UTC(2026, 8, 5, 7, 32, 0)).toISOString())
  })

  it('drops a segment whose amountText parses to nothing', () => {
    expect(buildLinesFromParsed([parsed({ amountText: 'sebentar' })], CATEGORIES, NOW)).toEqual([])
  })

  it('keeps income candidates out of an expense line and vice versa', () => {
    const [l] = buildLinesFromParsed(
      [parsed({ type: 'expense', categoryCandidates: ['c-salary', 'c-food'] })],
      CATEGORIES,
      NOW,
    )
    expect(l.categoryId).toBe('c-food')
    expect(l.options.map((o) => o.categoryId)).not.toContain('c-salary')
  })

  it('leaves categoryId null and offers fallback options when nothing matches', () => {
    const [l] = buildLinesFromParsed([parsed({ categoryCandidates: [] })], CATEGORIES, NOW)
    expect(l.categoryId).toBeNull()
    expect(l.options.length).toBeGreaterThan(0)
  })

  it('numbers the lines 1..n in order', () => {
    const out = buildLinesFromParsed([parsed(), parsed({ amountText: '12rb' })], CATEGORIES, NOW)
    expect(out.map((l) => l.n)).toEqual([1, 2])
  })

  it('caps the batch at MAX_DRAFT_LINES', () => {
    const many = Array.from({ length: 30 }, () => parsed())
    expect(buildLinesFromParsed(many, CATEGORIES, NOW)).toHaveLength(20)
  })
})

describe('buildLinesFromReceipt', () => {
  const result: ReceiptScanResult = {
    extraction: {
      merchant: 'Indomaret',
      merchantType: 'supermarket',
      date: '2026-09-05',
      items: [
        { name: 'Nasi goreng', quantity: 1, unitPrice: 35000, totalPrice: 35000 },
        { name: 'Teh botol', quantity: 2, unitPrice: 12000, totalPrice: 24000 },
      ],
      subtotal: 59000,
      tax: null,
      serviceCharge: null,
      discount: null,
      total: 59000,
      currency: 'IDR',
      confidence: 88,
      rawText: '',
      language: 'id',
    },
    mappedItems: [
      {
        name: 'Nasi goreng',
        quantity: 1,
        unitPrice: 35000,
        totalPrice: 35000,
        suggestedCategoryId: 'c-food',
        suggestedCategoryName: 'Makan & Minum',
        suggestedPillar: 'needs',
        mappingConfidence: 90,
        mappingReason: '',
        isManuallyMapped: false,
      },
      {
        name: 'Teh botol',
        quantity: 2,
        unitPrice: 12000,
        totalPrice: 24000,
        suggestedCategoryId: null,
        suggestedCategoryName: null,
        suggestedPillar: null,
        mappingConfidence: 0,
        mappingReason: '',
        isManuallyMapped: false,
      },
    ],
    totalConfidence: 88,
    warnings: [],
  }

  it('makes one line per receipt item, all expense', () => {
    const lines = buildLinesFromReceipt(result, CATEGORIES, NOW)
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.type === 'expense')).toBe(true)
    expect(lines.map((l) => l.amount)).toEqual([35000, 24000])
    expect(lines.map((l) => l.description)).toEqual(['Nasi goreng', 'Teh botol'])
  })

  it('uses the receipt date, not today, when the model read one', () => {
    const lines = buildLinesFromReceipt(result, CATEGORIES, NOW)
    expect(lines[0].dateIso.slice(0, 10)).toBe('2026-09-05')
  })

  it('falls back to now when the receipt carries no readable date', () => {
    const undated = { ...result, extraction: { ...result.extraction, date: null } }
    const lines = buildLinesFromReceipt(undated, CATEGORIES, NOW)
    expect(lines[0].dateIso.slice(0, 10)).toBe('2026-09-06')
  })

  it('carries quantity through and leaves an unmapped item without a category', () => {
    const lines = buildLinesFromReceipt(result, CATEGORIES, NOW)
    expect(lines[1].quantity).toBe(2)
    expect(lines[1].categoryId).toBeNull()
    expect(lines[1].options.length).toBeGreaterThan(0)
  })
})

describe('batchTotals', () => {
  it('sums each type separately and nets income minus expense', () => {
    const b = batch({
      lines: renumber([
        line({ type: 'expense', amount: 35000 }),
        line({ type: 'expense', amount: 24000 }),
        line({ type: 'income', amount: 5_000_000 }),
        line({ type: 'transfer', amount: 100000 }),
      ]),
    })
    expect(batchTotals(b)).toEqual({
      expense: 59000,
      income: 5_000_000,
      transfer: 100000,
      net: 4_941_000,
    })
  })
})

describe('collapseToSingle', () => {
  it('sums the lines and takes the highest-value line category', () => {
    const b = batch({
      source: 'receipt',
      merchant: 'Indomaret',
      lines: renumber([
        line({ amount: 24000, categoryId: 'c-transport', categoryName: 'Transportasi' }),
        line({ amount: 35000, categoryId: 'c-food', categoryName: 'Makan & Minum' }),
      ]),
    })
    const single = collapseToSingle(b)
    expect(single.amount).toBe(59000)
    expect(single.categoryId).toBe('c-food')
    expect(single.description).toBe('Indomaret')
  })

  it('falls back to a joined item list when there is no merchant', () => {
    const b = batch({
      source: 'receipt',
      merchant: null,
      lines: renumber([line({ description: 'Nasi goreng' }), line({ description: 'Teh botol' })]),
    })
    expect(collapseToSingle(b).description).toBe('Nasi goreng, Teh botol')
  })
})

describe('batchToDTOs', () => {
  it('emits one DTO per line in itemized mode, tagged "bot"', () => {
    const b = batch({ lines: renumber([line(), line({ amount: 24000 })]) })
    const dtos = batchToDTOs(b)
    expect(dtos).toHaveLength(2)
    expect(dtos[0].tags).toEqual(['bot'])
    expect(dtos[0].type).toBe('expense')
    expect(dtos[0].pillar).toBe('needs')
  })

  it('emits exactly one DTO in single mode', () => {
    const b = batch({ source: 'receipt', mode: 'single', lines: renumber([line(), line({ amount: 24000 })]) })
    expect(batchToDTOs(b)).toHaveLength(1)
    expect(batchToDTOs(b)[0].amount).toBe(59000)
  })

  it('attaches the Drive receipt to every DTO it produces', () => {
    const b = batch({
      source: 'receipt',
      lines: renumber([line(), line()]),
      receipt: { gDriveFileId: 'f1', gDriveWebViewLink: 'https://drive/f1' },
    })
    expect(batchToDTOs(b).every((d) => d.gDriveFileId === 'f1')).toBe(true)
  })

  it('keeps transfer as its own type rather than folding it into expense', () => {
    const b = batch({ lines: renumber([line({ type: 'transfer' })]) })
    expect(batchToDTOs(b)[0].type).toBe('transfer')
  })

  it('skips a line that still has no category — it can never be written', () => {
    const b = batch({ lines: renumber([line({ categoryId: null, categoryName: null }), line()]) })
    expect(batchToDTOs(b)).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/draft.test.ts`
Expected: FAIL — `Failed to resolve import "./draft"`.

- [ ] **Step 4: Implementasi `draft.ts`**

Buat `src/shared/bot/draft.ts`:

```ts
import type { Category, Pillar } from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'
import type { MappedReceiptItem, ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import { parseAmount } from './parse-amount'
import type { BotTxType, DraftBatch, DraftLine, ParsedLine } from './types'

/**
 * Pure model behind the review card. Nothing here touches Firestore, Gemini, or the
 * system clock — `now` is always injected — so every rule below is testable on its own.
 */

/** Firestore batch writes cap at 500; 20 also keeps the review card readable in chat. */
export const MAX_DRAFT_LINES = 20

/** How many alternate categories a line offers for the `kat <n> <k>` command. */
const MAX_OPTIONS = 4

export function renumber(lines: DraftLine[]): DraftLine[] {
  return lines.map((line, index) => ({ ...line, n: index + 1 }))
}

/** Income lines may only use income categories and spend lines may never use them —
 *  the same code-level backstop `core.ts` already applies to the model's suggestions. */
function categoriesFor(type: BotTxType, categories: Category[]): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

function buildOptions(
  candidateIds: string[],
  eligible: Category[],
): { categoryId: string; name: string }[] {
  const byId = new Map(eligible.map((c) => [c.id, c]))
  const picked = candidateIds.filter((id) => byId.has(id)).slice(0, MAX_OPTIONS)
  // Always offer something: a dead end with no options leaves the user unable to
  // finish the review at all.
  const filler = eligible.filter((c) => !picked.includes(c.id)).slice(0, MAX_OPTIONS - picked.length)
  return [...picked.map((id) => byId.get(id)!), ...filler].map((c) => ({ categoryId: c.id, name: c.name }))
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function buildLinesFromParsed(parsed: ParsedLine[], categories: Category[], now: Date): DraftLine[] {
  const lines: DraftLine[] = []

  for (const item of parsed.slice(0, MAX_DRAFT_LINES)) {
    // The model returns the literal substring it believes carries the nominal; the
    // number itself is always produced here, by the deterministic parser.
    const amount = parseAmount(item.amountText)
    if (amount === null || amount <= 0) continue

    const eligible = categoriesFor(item.type, categories)
    const options = buildOptions(item.categoryCandidates, eligible)
    const top = item.categoryCandidates.find((id) => eligible.some((c) => c.id === id))
    const chosen = top ? eligible.find((c) => c.id === top)! : null

    lines.push({
      n: 0,
      type: item.type,
      amount,
      description: item.description?.trim() || null,
      categoryId: chosen?.id ?? null,
      categoryName: chosen?.name ?? null,
      dateIso: shiftDays(now, item.dateOffset || 0).toISOString(),
      options,
    })
  }

  return renumber(lines)
}

/** Receipt dates arrive as "yyyy-MM-dd" with no clock; the current time is kept so
 *  the stamp in the reply still reads as a moment, not midnight. */
function receiptDate(isoDay: string | null, now: Date): Date {
  if (!isoDay || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return now
  const [y, m, d] = isoDay.split('-').map(Number)
  const dated = new Date(now.getTime())
  dated.setUTCFullYear(y, m - 1, d)
  return Number.isNaN(dated.getTime()) ? now : dated
}

export function buildLinesFromReceipt(
  result: ReceiptScanResult,
  categories: Category[],
  now: Date,
): DraftLine[] {
  const eligible = categoriesFor('expense', categories)
  const date = receiptDate(result.extraction.date, now).toISOString()

  const lines = result.mappedItems
    .slice(0, MAX_DRAFT_LINES)
    .filter((item: MappedReceiptItem) => item.totalPrice > 0)
    .map<DraftLine>((item) => {
      const chosen = item.suggestedCategoryId
        ? (eligible.find((c) => c.id === item.suggestedCategoryId) ?? null)
        : null
      return {
        n: 0,
        type: 'expense',
        amount: Math.round(item.totalPrice),
        description: item.name?.trim() || null,
        categoryId: chosen?.id ?? null,
        categoryName: chosen?.name ?? null,
        dateIso: date,
        options: buildOptions(item.suggestedCategoryId ? [item.suggestedCategoryId] : [], eligible),
        quantity: item.quantity ?? null,
      }
    })

  return renumber(lines)
}

export function batchTotals(batch: DraftBatch): {
  expense: number
  income: number
  transfer: number
  net: number
} {
  const sum = (type: BotTxType) =>
    batch.lines.filter((l) => l.type === type).reduce((total, l) => total + l.amount, 0)
  const expense = sum('expense')
  const income = sum('income')
  const transfer = sum('transfer')
  return { expense, income, transfer, net: income - expense }
}

/** The one line a `mode: 'single'` batch commits as. Category follows the highest-value
 *  line, since that is what the combined transaction mostly *is*. */
export function collapseToSingle(batch: DraftBatch): DraftLine {
  const amount = batch.lines.reduce((total, l) => total + l.amount, 0)
  const heaviest = [...batch.lines].sort((a, b) => b.amount - a.amount)[0]
  const description =
    batch.merchant?.trim() ||
    batch.lines
      .map((l) => l.description)
      .filter((d): d is string => Boolean(d))
      .join(', ') ||
    null

  return {
    ...heaviest,
    n: 1,
    amount,
    description,
    quantity: null,
  }
}

function pillarOf(line: DraftLine, categories: Map<string, Pillar>): Pillar | null {
  return line.categoryId ? (categories.get(line.categoryId) ?? null) : null
}

/**
 * The write shape. `type` comes from the line (so `transfer` survives), while `pillar`
 * still follows the category — the app's existing rule. A line with no category is
 * dropped rather than guessed at: it could never have been written anyway.
 */
export function batchToDTOs(batch: DraftBatch, categories: Category[] = []): CreateTransactionDTO[] {
  const pillars = new Map(categories.map((c) => [c.id, c.pillar]))
  const source = batch.mode === 'single' && batch.lines.length > 0 ? [collapseToSingle(batch)] : batch.lines

  return source
    .filter((line) => line.categoryId !== null && line.amount > 0)
    .map((line) => ({
      date: new Date(line.dateIso),
      type: line.type,
      pillar: pillarOf(line, pillars) ?? inferPillar(line.type),
      categoryId: line.categoryId as string,
      amount: line.amount,
      description: line.description ?? undefined,
      tags: ['bot'],
      gDriveFileId: batch.receipt?.gDriveFileId,
      gDriveWebViewLink: batch.receipt?.gDriveWebViewLink,
    }))
}

/** Only reached when the caller passed no category list (the pure-unit test path).
 *  Never a silent guess in production — `flow-review.ts` always passes categories. */
function inferPillar(type: BotTxType): Pillar {
  return type === 'income' ? 'income' : 'needs'
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/draft.test.ts`
Expected: PASS (18 test).

- [ ] **Step 6: Typecheck & commit**

```bash
npx tsc --noEmit
git add src/shared/bot/types.ts src/shared/bot/draft.ts src/shared/bot/draft.test.ts
git commit -m "feat(bot): draft batch model for multi-transaction and itemized receipts

DraftBatch always stores the itemized lines; mode only changes how they commit and
render, so gabung/pisah round-trips without losing data. Amounts are re-parsed from
the model's literal substring by parseAmount, never taken as a number from Gemini.
transfer is a first-class type — the old code derived type from the category pillar,
which made transfer unreachable."
```

---

