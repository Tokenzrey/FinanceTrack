import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { buildInsights, describeSuggestions } from './insights'
import { buildMonthlySummary } from './budget-math'
import type { Category, Transaction } from '@/shared/types/domain'

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
    createdAt: ts(new Date(2026, 7, 1)),
    updatedAt: ts(new Date(2026, 7, 1)),
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
    createdAt: ts(new Date(2026, 7, 1)),
    updatedAt: ts(new Date(2026, 7, 1)),
  },
]

function tx(day: number, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  const date = ts(new Date(2026, 7, day))
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

const today = new Date(2026, 7, 20)

function summaryFor(transactions: Transaction[]) {
  return buildMonthlySummary(categories, transactions, {
    year: 2026,
    month: 8,
    totalIncome: 10_000_000,
    pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
    today,
  })
}

describe('buildInsights', () => {
  it('praises a savings rate at or above the 20% target', () => {
    const rows = [tx(5, 2_000_000, { categoryId: 'save-1', pillar: 'savings' })]
    const insight = buildInsights(summaryFor(rows), rows).find((i) => i.id === 'savings-rate')
    expect(insight?.tone).toBe('good')
  })

  it('warns when the savings rate is below target', () => {
    const rows = [tx(5, 500_000, { categoryId: 'save-1', pillar: 'savings' })]
    const insight = buildInsights(summaryFor(rows), rows).find((i) => i.id === 'savings-rate')
    expect(insight?.tone).toBe('warn')
  })

  it('names the biggest spending category', () => {
    const rows = [tx(5, 1_200_000)]
    const insight = buildInsights(summaryFor(rows), rows).find((i) => i.id === 'biggest-category')
    expect(insight?.title).toContain('Makan')
  })

  it('flags regretted spending only when it exists', () => {
    const withRegret = [tx(5, 400_000, { mood: 'regret' })]
    expect(buildInsights(summaryFor(withRegret), withRegret).some((i) => i.id === 'regret')).toBe(
      true,
    )

    const without = [tx(5, 400_000)]
    expect(buildInsights(summaryFor(without), without).some((i) => i.id === 'regret')).toBe(false)
  })

  it('mentions a merchant only after three visits', () => {
    const twice = [
      tx(5, 50_000, { location: 'Indomaret' }),
      tx(6, 50_000, { location: 'Indomaret' }),
    ]
    expect(buildInsights(summaryFor(twice), twice).some((i) => i.id === 'merchant')).toBe(false)

    const thrice = [...twice, tx(7, 50_000, { location: 'Indomaret' })]
    expect(buildInsights(summaryFor(thrice), thrice).some((i) => i.id === 'merchant')).toBe(true)
  })

  it('produces nothing that crashes on an empty month', () => {
    expect(() => buildInsights(summaryFor([]), [])).not.toThrow()
  })
})

describe('describeSuggestions', () => {
  const history = [
    tx(1, 10_000, { description: 'Kopi pagi' }),
    tx(2, 20_000, { description: 'Makan siang' }),
    tx(3, 30_000, { description: 'Bensin', categoryId: 'other-1' }),
    tx(4, 40_000, { description: 'Kopi pagi' }),
  ]

  it('suggests descriptions matching what is typed', () => {
    expect(describeSuggestions(history, 'needs-1', 'kopi')).toEqual(['Kopi pagi'])
  })

  it('deduplicates repeated descriptions', () => {
    const result = describeSuggestions(history, 'needs-1', '')
    expect(result.filter((item) => item === 'Kopi pagi')).toHaveLength(1)
  })

  it('puts same-category history first', () => {
    const result = describeSuggestions(history, 'other-1', '')
    expect(result[0]).toBe('Bensin')
  })

  it('ignores case', () => {
    expect(describeSuggestions(history, 'needs-1', 'KOPI')).toEqual(['Kopi pagi'])
  })

  it('honours the limit', () => {
    expect(describeSuggestions(history, 'needs-1', '', 2)).toHaveLength(2)
  })

  it('returns nothing when no description matches', () => {
    expect(describeSuggestions(history, 'needs-1', 'zzz')).toEqual([])
  })
})
