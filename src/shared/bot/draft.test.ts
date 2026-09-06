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
