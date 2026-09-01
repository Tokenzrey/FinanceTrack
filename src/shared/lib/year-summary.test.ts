import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  buildYearSummary,
  categoryTrend,
  compareMonths,
  consistencyPercent,
  savingsRateOf,
} from './year-summary'
import { escapeCsvField, transactionsToCsv } from './csv-export'
import type { Category, MonthlyBudget, Transaction } from '@/shared/types/domain'

const ts = (d: Date) => Timestamp.fromDate(d)

const categories: Category[] = [
  {
    id: 'needs-1',
    name: 'Makan',
    pillar: 'needs',
    percentOfIncome: 50,
    color: '#14B8A6',
    icon: 'utensils',
    isSinkingFund: false,
    isRecurring: false,
    isActive: true,
    order: 0,
    createdAt: ts(new Date(2026, 0, 1)),
    updatedAt: ts(new Date(2026, 0, 1)),
  },
  {
    id: 'save-1',
    name: 'Dana Darurat',
    pillar: 'savings',
    percentOfIncome: 20,
    color: '#8B5CF6',
    icon: 'shield',
    isSinkingFund: true,
    isRecurring: false,
    isActive: true,
    order: 1,
    createdAt: ts(new Date(2026, 0, 1)),
    updatedAt: ts(new Date(2026, 0, 1)),
  },
]

function tx(
  month: number,
  day: number,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  const date = ts(new Date(2026, month - 1, day))
  return {
    id: Math.random().toString(36).slice(2),
    date,
    type: 'expense',
    pillar: 'needs',
    categoryId: 'needs-1',
    amount,
    tags: [],
    isRecurring: false,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  }
}

function budget(month: number, income: number): MonthlyBudget {
  return {
    id: `2026-${String(month).padStart(2, '0')}`,
    year: 2026,
    month,
    totalIncome: income,
    pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
    categoryOverrides: [],
    createdAt: ts(new Date(2026, month - 1, 1)),
    updatedAt: ts(new Date(2026, month - 1, 1)),
  }
}

describe('buildYearSummary', () => {
  const transactions = [
    tx(1, 5, 3_000_000),
    tx(1, 6, 1_000_000, { categoryId: 'save-1', pillar: 'savings' }),
    tx(2, 10, 5_000_000),
    tx(2, 11, 500_000, { categoryId: 'save-1', pillar: 'savings' }),
  ]
  const budgets = [budget(1, 10_000_000), budget(2, 10_000_000)]
  const summary = buildYearSummary(2026, transactions, budgets, categories)

  it('always produces twelve buckets', () => {
    expect(summary.months).toHaveLength(12)
    expect(summary.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('separates spending from savings', () => {
    expect(summary.months[0].spending).toBe(3_000_000)
    expect(summary.months[0].saved).toBe(1_000_000)
    expect(summary.totalSpending).toBe(8_000_000)
    expect(summary.totalSaved).toBe(1_500_000)
  })

  it('marks months without data', () => {
    expect(summary.months[0].hasData).toBe(true)
    expect(summary.months[5].hasData).toBe(false)
    expect(summary.months[5].absorptionRate).toBe(0)
  })

  it('picks best and worst month by savings rate, not by lowest spending', () => {
    // January saved 10% of income; February saved 5%.
    expect(summary.bestMonth?.month).toBe(1)
    expect(summary.worstMonth?.month).toBe(2)
  })

  it('ignores empty months when ranking', () => {
    // June has no income at all and must not win "best month" with a 0% rate.
    expect(summary.bestMonth?.month).not.toBe(6)
  })

  it('computes absorption against the planned income', () => {
    // (3.000.000 spent + 1.000.000 saved) / 10.000.000
    expect(summary.months[0].absorptionRate).toBeCloseTo(40)
  })

  it('counts distinct logging days', () => {
    expect(summary.months[0].activeDays).toBe(2)
    expect(consistencyPercent(summary.months[0])).toBeCloseTo((2 / 31) * 100)
  })
})

describe('loggingStreak', () => {
  it('counts consecutive logged months back from the last one', () => {
    const rows = [tx(1, 1, 100), tx(3, 1, 100), tx(4, 1, 100), tx(5, 1, 100)]
    expect(buildYearSummary(2026, rows, [], categories).loggingStreak).toBe(3)
  })

  it('is zero when nothing was logged', () => {
    expect(buildYearSummary(2026, [], [], categories).loggingStreak).toBe(0)
  })
})

describe('savingsRateOf', () => {
  it('returns zero rather than dividing by zero income', () => {
    const summary = buildYearSummary(2026, [], [], categories)
    expect(savingsRateOf(summary.months[0])).toBe(0)
  })
})

describe('categoryTrend', () => {
  it('produces a twelve-point series for one category', () => {
    const rows = [tx(1, 5, 100_000), tx(1, 6, 50_000), tx(3, 2, 70_000)]
    const trend = categoryTrend(2026, 'needs-1', rows)
    expect(trend).toHaveLength(12)
    expect(trend[0].amount).toBe(150_000)
    expect(trend[2].amount).toBe(70_000)
    expect(trend[1].amount).toBe(0)
  })

  it('excludes income and other categories', () => {
    const rows = [
      tx(1, 5, 100_000),
      tx(1, 6, 900_000, { type: 'income' }),
      tx(1, 7, 400_000, { categoryId: 'save-1' }),
    ]
    expect(categoryTrend(2026, 'needs-1', rows)[0].amount).toBe(100_000)
  })
})

describe('compareMonths', () => {
  it('reports the diff and percent change per category', () => {
    const a = [tx(1, 5, 1_000_000)]
    const b = [tx(2, 5, 1_500_000)]
    const [row] = compareMonths(a, b, categories)

    expect(row.name).toBe('Makan')
    expect(row.diff).toBe(500_000)
    expect(row.percentChange).toBeCloseTo(50)
  })

  it('leaves percent change null when the base period was zero', () => {
    const [row] = compareMonths([], [tx(2, 5, 200_000)], categories)
    expect(row.a).toBe(0)
    expect(row.percentChange).toBeNull()
  })

  it('drops categories untouched in both periods', () => {
    expect(compareMonths([], [], categories)).toEqual([])
  })

  it('sorts by the largest absolute movement', () => {
    const a = [tx(1, 5, 100_000), tx(1, 6, 1_000_000, { categoryId: 'save-1' })]
    const b = [tx(2, 5, 150_000), tx(2, 6, 3_000_000, { categoryId: 'save-1' })]
    expect(compareMonths(a, b, categories)[0].name).toBe('Dana Darurat')
  })
})

describe('escapeCsvField', () => {
  it('leaves plain text untouched', () => {
    expect(escapeCsvField('Indomaret')).toBe('Indomaret')
  })

  it('quotes fields containing a comma', () => {
    expect(escapeCsvField('Toko Maju, Jaya')).toBe('"Toko Maju, Jaya"')
  })

  it('doubles embedded quotes', () => {
    expect(escapeCsvField('Toko "Maju"')).toBe('"Toko ""Maju"""')
  })

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('baris1\nbaris2')).toBe('"baris1\nbaris2"')
  })
})

describe('transactionsToCsv', () => {
  it('writes a header plus one row per transaction', () => {
    const csv = transactionsToCsv([tx(8, 15, 125_000)], categories)
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe(
      'Tanggal,Jenis,Pilar,Kategori,Item,Keterangan,Toko,Metode,Tag,Perasaan,Jumlah',
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('2026-08-15')
    expect(lines[1]).toContain('Pengeluaran')
    expect(lines[1]).toContain('Makan')
  })

  it('writes amounts as plain integers a spreadsheet can sum', () => {
    const csv = transactionsToCsv([tx(8, 15, 1_500_000)], categories)
    expect(csv).toContain('1500000')
    // The Indonesian thousand separator would be read as text or as 1.5.
    expect(csv).not.toContain('1.500.000')
  })

  it('escapes a merchant name containing a comma', () => {
    const csv = transactionsToCsv([tx(8, 15, 1000, { location: 'Toko Maju, Jaya' })], categories)
    expect(csv).toContain('"Toko Maju, Jaya"')
  })

  it('joins tags with a space so the column stays one field', () => {
    const csv = transactionsToCsv([tx(8, 15, 1000, { tags: ['jajan', 'darurat'] })], categories)
    expect(csv).toContain('jajan darurat')
  })
})
