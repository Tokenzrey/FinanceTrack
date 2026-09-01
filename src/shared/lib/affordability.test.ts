import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  DTI_DANGER,
  OPPORTUNITY_YEARS,
  SBN_ANNUAL_RATE,
  calculateAffordability,
  coolingOffDaysLeft,
  isCoolingOff,
  type AffordabilityInput,
} from './affordability'
import type { Wishlist } from '@/shared/types/wishlist.types'

/** A comfortable buyer: strong buffer, no debt, plenty of budget left. */
function healthy(overrides: Partial<AffordabilityInput> = {}): AffordabilityInput {
  return {
    price: 2_000_000,
    financingMethod: 'cash',
    liquidAssets: 50_000_000,
    existingMonthlyDebt: 0,
    monthlyIncome: 15_000_000,
    monthlyExpenses: 5_000_000,
    remainingBudget: 8_000_000,
    ...overrides,
  }
}

describe('opportunity cost', () => {
  it('compounds the price at the SBN rate over five years', () => {
    const { metrics } = calculateAffordability(healthy({ price: 15_000_000 }))
    // 15jt * 1.06^5
    expect(metrics.opportunityCost5Years).toBeCloseTo(
      15_000_000 * (1 + SBN_ANNUAL_RATE) ** OPPORTUNITY_YEARS,
      0,
    )
    // The plan quotes ~Rp20.073.000; the exact figure is 20.073.384,5.
    expect(Math.round(metrics.opportunityCost5Years)).toBe(20_073_384)
  })

  it('mentions the compounded figure in the insights', () => {
    const { insights } = calculateAffordability(healthy({ price: 15_000_000 }))
    expect(insights.some((line) => line.includes('SBN'))).toBe(true)
  })
})

describe('percentOfRemainingBudget', () => {
  it('is the price as a share of what is left this month', () => {
    const { metrics } = calculateAffordability(
      healthy({ price: 2_000_000, remainingBudget: 8_000_000 }),
    )
    expect(metrics.percentOfRemainingBudget).toBeCloseTo(25)
  })

  it('reports 100% rather than Infinity when the budget is exhausted', () => {
    const { metrics } = calculateAffordability(healthy({ remainingBudget: 0 }))
    expect(metrics.percentOfRemainingBudget).toBe(100)
    expect(Number.isFinite(metrics.percentOfRemainingBudget)).toBe(true)
  })
})

describe('cash purchases and the emergency fund', () => {
  it('approves a purchase that leaves the buffer intact', () => {
    const result = calculateAffordability(healthy())
    expect(result.metrics.emergencyFundImpact.status).toBe('Aman')
    expect(result.decision).toBe('Aman Dibeli')
    expect(result.recommendationScore).toBeGreaterThanOrEqual(70)
  })

  it('subtracts the price from liquid assets', () => {
    const { metrics } = calculateAffordability(
      healthy({ price: 10_000_000, liquidAssets: 50_000_000 }),
    )
    expect(metrics.emergencyFundImpact.beforePurchase).toBe(50_000_000)
    expect(metrics.emergencyFundImpact.afterPurchase).toBe(40_000_000)
  })

  it('flags Kritis when the buffer drops under three months of expenses', () => {
    // 20jt liquid, 16jt purchase, 5jt/month expenses -> 4jt left against a 15jt floor.
    const result = calculateAffordability(
      healthy({ price: 16_000_000, liquidAssets: 20_000_000, remainingBudget: 20_000_000 }),
    )
    expect(result.metrics.emergencyFundImpact.status).toBe('Kritis')
    expect(result.decision).toBe('Gunakan Tabungan')
  })

  it('refuses outright when liquid assets cannot cover the price', () => {
    const result = calculateAffordability(healthy({ price: 60_000_000, liquidAssets: 5_000_000 }))
    expect(result.metrics.emergencyFundImpact.afterPurchase).toBeLessThan(0)
    expect(result.decision).toBe('Tunda (Risiko Tinggi)')
  })

  it('does not touch liquid assets for a financed purchase', () => {
    const { metrics } = calculateAffordability(
      healthy({ financingMethod: 'credit_card', monthlyInstallment: 500_000 }),
    )
    expect(metrics.emergencyFundImpact.afterPurchase).toBe(50_000_000)
  })
})

describe('financed purchases and debt ratio', () => {
  it('adds the new instalment to existing debt', () => {
    const { metrics } = calculateAffordability(
      healthy({
        financingMethod: 'credit_card',
        monthlyInstallment: 1_000_000,
        existingMonthlyDebt: 2_000_000,
        monthlyIncome: 10_000_000,
      }),
    )
    expect(metrics.postPurchaseDebtRatio).toBeCloseTo(30)
  })

  it('rejects a plan that pushes DTI past the danger line', () => {
    const result = calculateAffordability(
      healthy({
        financingMethod: 'paylater',
        monthlyInstallment: 2_000_000,
        existingMonthlyDebt: 2_000_000,
        monthlyIncome: 10_000_000,
      }),
    )
    // 40% DTI
    expect(result.metrics.postPurchaseDebtRatio).toBeCloseTo(40)
    expect(result.decision).toBe('Tunda (Risiko Tinggi)')
    expect(result.recommendationScore).toBeLessThan(45)
  })

  it('overrides a high DTI even when everything else is comfortable', () => {
    const result = calculateAffordability(
      healthy({
        price: 1_000,
        financingMethod: 'credit_card',
        monthlyInstallment: 5_000_000,
        existingMonthlyDebt: 0,
        monthlyIncome: 10_000_000,
        liquidAssets: 500_000_000,
      }),
    )
    expect(result.decision).toBe('Tunda (Risiko Tinggi)')
  })

  it('accepts a modest instalment', () => {
    const result = calculateAffordability(
      healthy({
        financingMethod: 'credit_card',
        monthlyInstallment: 500_000,
        existingMonthlyDebt: 0,
        monthlyIncome: 15_000_000,
      }),
    )
    expect(result.metrics.postPurchaseDebtRatio).toBeLessThan(DTI_DANGER)
    expect(result.decision).toBe('Aman Dibeli')
  })

  it('reports zero DTI rather than dividing by zero income', () => {
    const { metrics } = calculateAffordability(
      healthy({ financingMethod: 'paylater', monthlyInstallment: 1_000_000, monthlyIncome: 0 }),
    )
    expect(metrics.postPurchaseDebtRatio).toBe(0)
  })
})

describe('score bounds', () => {
  it('never falls below zero or rises above 100', () => {
    const worst = calculateAffordability(
      healthy({
        price: 500_000_000,
        financingMethod: 'paylater',
        monthlyInstallment: 20_000_000,
        existingMonthlyDebt: 10_000_000,
        monthlyIncome: 5_000_000,
        liquidAssets: 0,
        remainingBudget: 0,
      }),
    )
    expect(worst.recommendationScore).toBeGreaterThanOrEqual(0)

    const best = calculateAffordability(
      healthy({ price: 1_000, liquidAssets: 1_000_000_000, remainingBudget: 100_000_000 }),
    )
    expect(best.recommendationScore).toBeLessThanOrEqual(100)
    expect(best.recommendationScore).toBe(100)
  })
})

describe('insights', () => {
  it('warns in plain language when the instalment overloads the ratio', () => {
    const { insights } = calculateAffordability(
      healthy({
        financingMethod: 'paylater',
        monthlyInstallment: 2_000_000,
        existingMonthlyDebt: 2_000_000,
        monthlyIncome: 10_000_000,
      }),
    )
    expect(insights.some((line) => line.includes('rasio utang bulananmu naik'))).toBe(true)
  })

  it('explains an exhausted budget instead of quoting a nonsense percentage', () => {
    const { insights } = calculateAffordability(healthy({ remainingBudget: 0 }))
    expect(insights.some((line) => line.includes('sudah habis'))).toBe(true)
  })

  it('always includes the opportunity-cost line', () => {
    for (const method of ['cash', 'savings', 'credit_card', 'paylater'] as const) {
      const { insights } = calculateAffordability(healthy({ financingMethod: method }))
      expect(insights.some((line) => line.includes('tahun lagi menjadi'))).toBe(true)
    }
  })
})

describe('cooling-off period', () => {
  const base = {
    id: 'w1',
    name: 'iPhone',
    estimatedPrice: 16_000_000,
    priority: 'high',
    status: 'idea',
    justification: 'want',
    financingMethod: 'cash',
    createdAt: Timestamp.fromDate(new Date(2026, 7, 1)),
    updatedAt: Timestamp.fromDate(new Date(2026, 7, 1)),
  } as Wishlist

  it('is active while the end date is in the future', () => {
    const item = {
      ...base,
      coolingOffEndDate: Timestamp.fromDate(new Date(2026, 7, 10)),
    }
    expect(isCoolingOff(item, new Date(2026, 7, 5))).toBe(true)
    expect(coolingOffDaysLeft(item, new Date(2026, 7, 5))).toBe(5)
  })

  it('is over once the date has passed', () => {
    const item = {
      ...base,
      coolingOffEndDate: Timestamp.fromDate(new Date(2026, 7, 3)),
    }
    expect(isCoolingOff(item, new Date(2026, 7, 10))).toBe(false)
    expect(coolingOffDaysLeft(item, new Date(2026, 7, 10))).toBe(0)
  })

  it('is absent when no cooling-off period was set', () => {
    expect(isCoolingOff(base)).toBe(false)
    expect(coolingOffDaysLeft(base)).toBe(0)
  })
})
