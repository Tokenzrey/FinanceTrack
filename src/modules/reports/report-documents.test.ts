// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { Timestamp } from 'firebase/firestore'
import { renderToBuffer } from '@react-pdf/renderer'
import { MonthlyReportDocument } from './MonthlyReportDocument'
import { AnnualReportDocument } from './AnnualReportDocument'
import { buildMonthlySummary } from '@/shared/lib/budget-math'
import { buildYearSummary } from '@/shared/lib/year-summary'
import type { CategorySummary, Category, Transaction } from '@/shared/types/domain'

/**
 * Both documents render a <Document> at their root, but their prop types are their own,
 * so TypeScript cannot see that through `createElement`. This narrows it at the one
 * boundary rather than loosening either component's signature.
 */
const asDocument = (element: ReturnType<typeof createElement>) =>
  element as Parameters<typeof renderToBuffer>[0]

/**
 * Renders each report for real. @react-pdf validates styles at render time, so an
 * invalid style prop or a bad layout only fails when the user clicks Export — this
 * catches it in CI instead.
 */

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
    id: `tx-${day}-${amount}`,
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

const transactions = [
  tx(3, 250_000, { description: 'Belanja mingguan', location: 'Indomaret' }),
  tx(9, 1_200_000, { description: 'Servis motor' }),
  tx(15, 800_000, { categoryId: 'save-1', pillar: 'savings' }),
]

const monthlySummary = buildMonthlySummary(categories, transactions, {
  year: 2026,
  month: 8,
  totalIncome: 10_000_000,
  pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
  today: new Date(2026, 7, 20),
})

describe('MonthlyReportDocument', () => {
  it('renders to a valid PDF buffer', async () => {
    const buffer = await renderToBuffer(
      asDocument(
        createElement(MonthlyReportDocument, {
          summary: monthlySummary,
          transactions,
          notes: 'Servis motor tak terduga bulan ini.',
          generatedAt: new Date(2026, 7, 31),
        }),
      ),
    )

    // "%PDF" magic number — proof this is a real document, not an empty buffer.
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  }, 30_000)

  it('renders with no transactions and no notes', async () => {
    const empty = buildMonthlySummary([], [], {
      year: 2026,
      month: 8,
      totalIncome: 0,
      pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
      today: new Date(2026, 7, 20),
    })

    const buffer = await renderToBuffer(
      asDocument(createElement(MonthlyReportDocument, { summary: empty, transactions: [] })),
    )
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30_000)

  it('survives a category with a zero budget without dividing by zero', async () => {
    const zeroBudget = {
      ...monthlySummary,
      categories: monthlySummary.categories.map((row): CategorySummary => ({
        ...row,
        budget: 0,
        absorptionRate: 0,
      })),
      pillarSummary: {
        income: { budget: 0, used: 0 },
        needs: { budget: 0, used: 0 },
        wants: { budget: 0, used: 0 },
        savings: { budget: 0, used: 0 },
      },
    }

    const buffer = await renderToBuffer(
      asDocument(createElement(MonthlyReportDocument, { summary: zeroBudget, transactions })),
    )
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30_000)
})

describe('AnnualReportDocument', () => {
  it('renders to a valid PDF buffer', async () => {
    const yearSummary = buildYearSummary(2026, transactions, [], categories)

    const buffer = await renderToBuffer(
      asDocument(
        createElement(AnnualReportDocument, {
          summary: yearSummary,
          generatedAt: new Date(2026, 11, 31),
        }),
      ),
    )

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  }, 30_000)

  it('renders an empty year', async () => {
    const buffer = await renderToBuffer(
      asDocument(
        createElement(AnnualReportDocument, {
          summary: buildYearSummary(2026, [], [], categories),
        }),
      ),
    )
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30_000)
})
