import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  budgetForCategory,
  cumulativeCurve,
  buildCategorySummary,
  buildMonthlySummary,
  daysLeftInMonth,
  financialHealthScore,
  pillarBudgets,
  statusFor,
} from './budget-math'
import type { Category, Transaction } from '@/shared/types/domain'

const ts = (d: Date) => Timestamp.fromDate(d)

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Makan',
    pillar: 'needs',
    percentOfIncome: 20,
    color: '#14B8A6',
    icon: 'utensils',
    isSinkingFund: false,
    isRecurring: false,
    isActive: true,
    order: 0,
    createdAt: ts(new Date(2026, 7, 1)),
    updatedAt: ts(new Date(2026, 7, 1)),
    ...overrides,
  }
}

function tx(amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: ts(new Date(2026, 7, 5)),
    type: 'expense',
    pillar: 'needs',
    categoryId: 'cat-1',
    amount,
    tags: [],
    isRecurring: false,
    createdAt: ts(new Date(2026, 7, 5)),
    updatedAt: ts(new Date(2026, 7, 5)),
    ...overrides,
  }
}

describe('statusFor', () => {
  it('maps absorption to the four dashboard states', () => {
    expect(statusFor(0)).toBe('safe')
    expect(statusFor(79.9)).toBe('safe')
    expect(statusFor(80)).toBe('warning')
    expect(statusFor(100)).toBe('danger')
    expect(statusFor(100.1)).toBe('exceeded')
  })
})

describe('budgetForCategory', () => {
  const income = 10_000_000

  it('uses percentOfIncome by default', () => {
    expect(budgetForCategory(category({ percentOfIncome: 20 }), income)).toBe(2_000_000)
  })

  it('prefers a fixed override over a percent override', () => {
    const budget = budgetForCategory(category(), income, [
      { categoryId: 'cat-1', percentOverride: 50, fixedBudget: 1_500_000 },
    ])
    expect(budget).toBe(1_500_000)
  })

  it('applies a percent override when no fixed amount is set', () => {
    expect(
      budgetForCategory(category(), income, [{ categoryId: 'cat-1', percentOverride: 5 }]),
    ).toBe(500_000)
  })

  it('never returns a negative budget', () => {
    expect(budgetForCategory(category({ percentOfIncome: -10 }), income)).toBe(0)
  })
})

describe('pillarBudgets', () => {
  it('splits income 50/30/20', () => {
    const budgets = pillarBudgets(10_000_000, { needs: 0.5, wants: 0.3, savings: 0.2 })
    expect(budgets.needs).toBe(5_000_000)
    expect(budgets.wants).toBe(3_000_000)
    expect(budgets.savings).toBe(2_000_000)
  })
})

describe('daysLeftInMonth', () => {
  it('counts today as still spendable', () => {
    expect(daysLeftInMonth(2026, 8, new Date(2026, 7, 20))).toBe(12)
  })

  it('returns 0 for a month already past', () => {
    expect(daysLeftInMonth(2026, 7, new Date(2026, 7, 20))).toBe(0)
  })

  it('returns the whole month for a future period', () => {
    expect(daysLeftInMonth(2026, 9, new Date(2026, 7, 20))).toBe(30)
  })
})

describe('buildCategorySummary', () => {
  const today = new Date(2026, 7, 20) // 20 Aug 2026 → 12 days left of 31

  it('computes absorption, remaining and daily allowance', () => {
    const summary = buildCategorySummary(category(), [tx(600_000), tx(400_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })

    expect(summary.budget).toBe(2_000_000)
    expect(summary.used).toBe(1_000_000)
    expect(summary.remaining).toBe(1_000_000)
    expect(summary.absorptionRate).toBe(50)
    expect(summary.status).toBe('safe')
    expect(summary.daysLeft).toBe(12)
    // 1.000.000 remaining spread over 12 days
    expect(Math.round(summary.dailyAllowanceLeft)).toBe(83_333)
  })

  it('ignores income transactions when measuring spend', () => {
    const summary = buildCategorySummary(
      category(),
      [tx(500_000), tx(9_000_000, { type: 'income' })],
      {
        year: 2026,
        month: 8,
        totalIncome: 10_000_000,
        today,
      },
    )
    expect(summary.used).toBe(500_000)
  })

  it('flags an exceeded category', () => {
    const summary = buildCategorySummary(category(), [tx(2_500_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    expect(summary.status).toBe('exceeded')
    expect(summary.remaining).toBe(-500_000)
    expect(summary.dailyAllowanceLeft).toBe(0)
  })

  it('reports the trend against last month', () => {
    const summary = buildCategorySummary(category(), [tx(1_200_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      previousMonthSpend: { 'cat-1': 1_000_000 },
      today,
    })
    expect(summary.vsLastMonth).toBeCloseTo(20)
    expect(summary.trend).toBe('up')
  })
})

describe('buildMonthlySummary', () => {
  const today = new Date(2026, 7, 20)
  const categories = [
    category({ id: 'needs-1', pillar: 'needs', percentOfIncome: 50 }),
    category({ id: 'wants-1', pillar: 'wants', percentOfIncome: 30, name: 'Hiburan' }),
    category({ id: 'save-1', pillar: 'savings', percentOfIncome: 20, name: 'Dana Darurat' }),
  ]

  const transactions = [
    tx(3_000_000, { categoryId: 'needs-1', pillar: 'needs' }),
    tx(1_000_000, { categoryId: 'wants-1', pillar: 'wants' }),
    tx(2_000_000, { categoryId: 'save-1', pillar: 'savings' }),
  ]

  const summary = buildMonthlySummary(categories, transactions, {
    year: 2026,
    month: 8,
    totalIncome: 10_000_000,
    pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
    today,
  })

  it('totals budget and usage across spend pillars', () => {
    expect(summary.totalBudget).toBe(10_000_000)
    expect(summary.totalUsed).toBe(6_000_000)
    expect(summary.netCashFlow).toBe(4_000_000)
  })

  it('treats savings contributions as saved, not spent', () => {
    expect(summary.totalSaved).toBe(2_000_000)
    expect(summary.savingsRate).toBe(20)
    // 4jt spending over 20 elapsed days
    expect(Math.round(summary.dailyAvgSpend)).toBe(200_000)
  })

  it('groups usage per pillar', () => {
    expect(summary.pillarSummary.needs).toEqual({ budget: 5_000_000, used: 3_000_000 })
    expect(summary.pillarSummary.wants).toEqual({ budget: 3_000_000, used: 1_000_000 })
    expect(summary.pillarSummary.savings).toEqual({ budget: 2_000_000, used: 2_000_000 })
  })

  it('names the biggest spending category', () => {
    expect(summary.topSpendingCategory).toBe('Makan')
  })

  it('falls back to income transactions when no income is planned', () => {
    const fallback = buildMonthlySummary(
      categories,
      [...transactions, tx(8_000_000, { type: 'income', pillar: 'income' })],
      {
        year: 2026,
        month: 8,
        totalIncome: 0,
        pillarConfig: { needs: 0.5, wants: 0.3, savings: 0.2 },
        today,
      },
    )
    expect(fallback.totalIncome).toBe(8_000_000)
  })
})

describe('financialHealthScore', () => {
  it('scores a perfect profile at 100', () => {
    const { total } = financialHealthScore({
      savingsRate: 20,
      budgetAdherence: 100,
      emergencyFundProgress: 100,
      debtToIncomeRatio: 0,
      consistency: 100,
      moodPositiveRate: 100,
    })
    expect(total).toBe(100)
  })

  it('scores an empty profile at 0 apart from the zero-debt credit', () => {
    const { total, breakdown } = financialHealthScore({
      savingsRate: 0,
      budgetAdherence: 0,
      emergencyFundProgress: 0,
      debtToIncomeRatio: 40,
      consistency: 0,
      moodPositiveRate: 0,
    })
    expect(total).toBe(0)
    expect(breakdown.debtToIncomeRatio).toBe(0)
  })

  it('caps an over-target savings rate at full marks', () => {
    const { breakdown } = financialHealthScore({
      savingsRate: 60,
      budgetAdherence: 0,
      emergencyFundProgress: 0,
      debtToIncomeRatio: 100,
      consistency: 0,
      moodPositiveRate: 0,
    })
    expect(breakdown.savingsRate).toBe(100)
    expect(breakdown.debtToIncomeRatio).toBe(0)
  })
})

describe('cumulativeCurve', () => {
  const today = new Date(2026, 7, 20)

  it('accumulates spend per day and stops at today', () => {
    const points = cumulativeCurve(
      [
        tx(100_000, { date: ts(new Date(2026, 7, 2)) }),
        tx(200_000, { date: ts(new Date(2026, 7, 2)) }),
        tx(300_000, { date: ts(new Date(2026, 7, 10)) }),
      ],
      { year: 2026, month: 8, totalBudget: 3_100_000, today },
    )

    expect(points).toHaveLength(31)
    expect(points[0].actual).toBe(0)
    expect(points[1].actual).toBe(300_000)
    expect(points[9].actual).toBe(600_000)
    expect(points[19].actual).toBe(600_000)
    // Days after today carry no actual value.
    expect(points[20].actual).toBeNull()
    expect(points[30].actual).toBeNull()
  })

  it('draws a plan line that lands on the budget at month end', () => {
    const points = cumulativeCurve([], { year: 2026, month: 8, totalBudget: 3_100_000, today })
    expect(points[0].plan).toBeCloseTo(100_000)
    expect(points[30].plan).toBeCloseTo(3_100_000)
  })

  it('fills the whole month for a period already past', () => {
    const points = cumulativeCurve([tx(500_000, { date: ts(new Date(2026, 6, 5)) })], {
      year: 2026,
      month: 7,
      totalBudget: 1_000_000,
      today,
    })
    expect(points[30].actual).toBe(500_000)
  })

  it('ignores income and out-of-month dates', () => {
    const points = cumulativeCurve(
      [
        tx(900_000, { type: 'income', date: ts(new Date(2026, 7, 3)) }),
        tx(400_000, { date: ts(new Date(2026, 7, 3)) }),
      ],
      { year: 2026, month: 8, totalBudget: 1_000_000, today },
    )
    expect(points[2].actual).toBe(400_000)
  })
})
