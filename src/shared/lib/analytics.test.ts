import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  budgetEfficiencyScores,
  burnRateAlerts,
  emergencyFundProgress,
  liquidAssets,
  loggingConsistency,
  moodBreakdown,
  paymentMethodBreakdown,
  projectSavings,
  realSavingsGap,
  regretTotal,
  requiredContribution,
  simulateCut,
  tagBreakdown,
  topMerchants,
} from './analytics'
import { buildCategorySummary } from './budget-math'
import type { Category, SavingsGoal, Transaction } from '@/shared/types/domain'

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
  const date = overrides.date ?? ts(new Date(2026, 7, 5))
  return {
    id: Math.random().toString(36).slice(2),
    date,
    type: 'expense',
    pillar: 'needs',
    categoryId: 'cat-1',
    amount,
    tags: [],
    isRecurring: false,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  }
}

describe('topMerchants', () => {
  it('totals spend per merchant, biggest first', () => {
    const rows = [
      tx(50_000, { location: 'Indomaret' }),
      tx(70_000, { location: 'Indomaret' }),
      tx(200_000, { location: 'Hypermart' }),
    ]
    const result = topMerchants(rows)

    expect(result[0]).toMatchObject({ name: 'Hypermart', total: 200_000, count: 1 })
    expect(result[1]).toMatchObject({ name: 'Indomaret', total: 120_000, count: 2 })
    expect(result[1].average).toBe(60_000)
  })

  it('groups merchants case-insensitively', () => {
    const rows = [tx(10_000, { location: 'Indomaret' }), tx(10_000, { location: 'indomaret' })]
    expect(topMerchants(rows)).toHaveLength(1)
    expect(topMerchants(rows)[0].count).toBe(2)
  })

  it('skips transactions with no merchant and skips income', () => {
    const rows = [tx(10_000), tx(900_000, { type: 'income', location: 'Kantor' })]
    expect(topMerchants(rows)).toEqual([])
  })

  it('honours the limit', () => {
    const rows = Array.from({ length: 15 }, (_, i) => tx(1000 * (i + 1), { location: `Toko ${i}` }))
    expect(topMerchants(rows, 5)).toHaveLength(5)
  })
})

describe('moodBreakdown and regretTotal', () => {
  const rows = [
    tx(100_000, { mood: 'happy' }),
    tx(200_000, { mood: 'regret' }),
    tx(50_000, { mood: 'regret' }),
    tx(30_000),
  ]

  it('buckets spending by mood and keeps unset separate', () => {
    const result = moodBreakdown(rows)
    expect(result.find((r) => r.mood === 'regret')).toMatchObject({ total: 250_000, count: 2 })
    expect(result.find((r) => r.mood === 'unset')).toMatchObject({ total: 30_000, count: 1 })
  })

  it('omits moods with no transactions', () => {
    expect(moodBreakdown(rows).find((r) => r.mood === 'neutral')).toBeUndefined()
  })

  it('totals regretted spending', () => {
    expect(regretTotal(rows)).toBe(250_000)
  })
})

describe('paymentMethodBreakdown', () => {
  it('reports totals and percentages that add to 100', () => {
    const rows = [
      tx(300_000, { paymentMethod: 'qris' }),
      tx(100_000, { paymentMethod: 'cash' }),
      tx(100_000, { paymentMethod: 'cash' }),
    ]
    const result = paymentMethodBreakdown(rows)

    expect(result[0]).toMatchObject({ method: 'qris', total: 300_000 })
    expect(result.reduce((sum, r) => sum + r.percent, 0)).toBeCloseTo(100)
  })

  it('groups transactions with no method under unset', () => {
    expect(paymentMethodBreakdown([tx(50_000)])[0].method).toBe('unset')
  })
})

describe('tagBreakdown', () => {
  it('counts a transaction once per tag it carries', () => {
    const rows = [tx(100_000, { tags: ['jajan', 'darurat'] }), tx(50_000, { tags: ['jajan'] })]
    const result = tagBreakdown(rows)
    expect(result[0]).toEqual({ tag: 'jajan', total: 150_000 })
    expect(result[1]).toEqual({ tag: 'darurat', total: 100_000 })
  })
})

describe('budgetEfficiencyScores', () => {
  const today = new Date(2026, 7, 20)

  it('scores exact-budget spending near the top', () => {
    const spot_on = buildCategorySummary(category(), [tx(2_000_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    const [row] = budgetEfficiencyScores([spot_on])
    expect(row.status).toBe('efficient')
    expect(row.score).toBeGreaterThan(90)
  })

  it('penalises overspending, worse the further past 100%', () => {
    const over = buildCategorySummary(category(), [tx(3_000_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    const [row] = budgetEfficiencyScores([over])
    expect(row.status).toBe('over')
    expect(row.score).toBeLessThan(100)
  })

  it('penalises a budget left mostly unused, not just overspending', () => {
    const under = buildCategorySummary(category(), [tx(200_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    const [row] = budgetEfficiencyScores([under])
    expect(row.status).toBe('under')
    expect(row.score).toBeLessThan(90)
  })

  it('sorts worst first and skips categories with no budget', () => {
    const noBudget = buildCategorySummary(category({ id: 'c2', percentOfIncome: 0 }), [], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    const over = buildCategorySummary(category(), [tx(4_000_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    const rows = budgetEfficiencyScores([noBudget, over])
    expect(rows).toHaveLength(1)
    expect(rows[0].categoryId).toBe('cat-1')
  })
})

describe('burnRateAlerts', () => {
  const today = new Date(2026, 7, 10) // 10 of 31 days elapsed

  it('flags a category whose pace overshoots its budget', () => {
    const hot = buildCategorySummary(category(), [tx(1_500_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    // 1,5jt in 10 days projects to ~4,65jt against a 2jt budget.
    expect(burnRateAlerts([hot])).toHaveLength(1)
  })

  it('leaves a category on track alone', () => {
    const calm = buildCategorySummary(category(), [tx(200_000)], {
      year: 2026,
      month: 8,
      totalIncome: 10_000_000,
      today,
    })
    expect(burnRateAlerts([calm])).toEqual([])
  })
})

describe('projectSavings', () => {
  const from = new Date(2026, 7, 1)

  it('computes months to reach the target', () => {
    const result = projectSavings(2_000_000, 10_000_000, 1_000_000, from)
    expect(result.monthsToTarget).toBe(8)
    expect(result.projectedDate?.getMonth()).toBe(3) // April 2027
  })

  it('rounds a partial month up', () => {
    expect(projectSavings(0, 1_000_000, 300_000, from).monthsToTarget).toBe(4)
  })

  it('reports zero months when the goal is already met', () => {
    expect(projectSavings(10_000_000, 10_000_000, 500_000, from).monthsToTarget).toBe(0)
  })

  it('returns null rather than Infinity when nothing is contributed', () => {
    const result = projectSavings(0, 5_000_000, 0, from)
    expect(result.monthsToTarget).toBeNull()
    expect(result.projectedDate).toBeNull()
    expect(result.shortfallPerMonth).toBe(5_000_000)
  })
})

describe('requiredContribution', () => {
  const from = new Date(2026, 7, 1)

  function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
    return {
      id: 'goal-1',
      name: 'Liburan',
      categoryId: 'save-1',
      targetAmount: 12_000_000,
      currentAmount: 0,
      monthlyContribution: 0,
      priority: 'medium',
      isAchieved: false,
      createdAt: ts(from),
      ...overrides,
    }
  }

  it('spreads the remainder across the months left', () => {
    const result = requiredContribution(goal({ targetDate: ts(new Date(2027, 7, 1)) }), from)
    expect(result).toBeCloseTo(1_000_000)
  })

  it('returns null when there is no target date', () => {
    expect(requiredContribution(goal(), from)).toBeNull()
  })

  it('returns null when the target date has passed', () => {
    expect(requiredContribution(goal({ targetDate: ts(new Date(2026, 6, 1)) }), from)).toBeNull()
  })

  it('returns zero when the goal is already funded', () => {
    const funded = goal({ currentAmount: 12_000_000, targetDate: ts(new Date(2027, 7, 1)) })
    expect(requiredContribution(funded, from)).toBe(0)
  })
})

describe('simulateCut', () => {
  const today = new Date(2026, 7, 20)
  const summary = buildCategorySummary(category(), [tx(1_000_000)], {
    year: 2026,
    month: 8,
    totalIncome: 10_000_000,
    today,
  })

  it('reports the monthly and yearly cash freed', () => {
    const result = simulateCut([summary], 'cat-1', 20)
    expect(result?.monthlySaving).toBe(200_000)
    expect(result?.yearlySaving).toBe(2_400_000)
    expect(result?.newSpend).toBe(800_000)
  })

  it('clamps a nonsense percentage', () => {
    expect(simulateCut([summary], 'cat-1', 250)?.monthlySaving).toBe(1_000_000)
    expect(simulateCut([summary], 'cat-1', -50)?.monthlySaving).toBe(0)
  })

  it('returns null for an unknown category', () => {
    expect(simulateCut([summary], 'missing', 10)).toBeNull()
  })
})

describe('realSavingsGap', () => {
  it('is positive when savings outpace inflation', () => {
    expect(realSavingsGap(20, 2.84)).toBeCloseTo(17.16)
  })

  it('is negative when inflation wins', () => {
    expect(realSavingsGap(1, 2.84)).toBeCloseTo(-1.84)
  })
})

describe('loggingConsistency', () => {
  it('counts distinct days, not transactions', () => {
    const rows = [
      tx(1000, { date: ts(new Date(2026, 7, 1)) }),
      tx(1000, { date: ts(new Date(2026, 7, 1)) }),
      tx(1000, { date: ts(new Date(2026, 7, 2)) }),
    ]
    expect(loggingConsistency(rows, 10)).toBeCloseTo(20)
  })

  it('returns zero for an empty period', () => {
    expect(loggingConsistency([], 0)).toBe(0)
  })
})

describe('liquidAssets and emergencyFundProgress', () => {
  it('counts only cash and savings as liquid', () => {
    const assets = [
      { type: 'cash', value: 2_000_000 },
      { type: 'savings', value: 8_000_000 },
      { type: 'property', value: 500_000_000 },
    ]
    expect(liquidAssets(assets)).toBe(10_000_000)
  })

  it('measures progress toward three months of expenses', () => {
    expect(emergencyFundProgress(9_000_000, 3_000_000)).toBeCloseTo(100)
    expect(emergencyFundProgress(4_500_000, 3_000_000)).toBeCloseTo(50)
  })

  it('caps at 100 when over-funded', () => {
    expect(emergencyFundProgress(90_000_000, 3_000_000)).toBe(100)
  })

  it('does not divide by zero expenses', () => {
    expect(emergencyFundProgress(1_000_000, 0)).toBe(100)
    expect(emergencyFundProgress(0, 0)).toBe(0)
  })
})
