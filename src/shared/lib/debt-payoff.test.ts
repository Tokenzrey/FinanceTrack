import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { comparePayoffStrategies, debtToIncomeRatio, simulatePayoff } from './debt-payoff'
import type { Liability } from '@/shared/types/domain'

function debt(overrides: Partial<Liability> & { id: string }): Liability {
  return {
    name: overrides.id,
    type: 'other',
    totalAmount: overrides.remainingAmount ?? 0,
    remainingAmount: 0,
    monthlyPayment: 0,
    updatedAt: Timestamp.fromDate(new Date(2026, 7, 1)),
    ...overrides,
  }
}

describe('simulatePayoff', () => {
  it('clears a single interest-free debt in the expected number of months', () => {
    const plan = simulatePayoff(
      [debt({ id: 'a', remainingAmount: 1_000_000, monthlyPayment: 250_000, interestRate: 0 })],
      'avalanche',
    )
    expect(plan.monthsToDebtFree).toBe(4)
    expect(plan.totalInterest).toBe(0)
    expect(plan.totalPaid).toBeCloseTo(1_000_000, 0)
  })

  it('returns an empty plan when there is nothing to pay', () => {
    const plan = simulatePayoff([], 'avalanche')
    expect(plan.monthsToDebtFree).toBe(0)
    expect(plan.schedule).toEqual([])
  })

  it('ignores debts already at zero', () => {
    const plan = simulatePayoff(
      [debt({ id: 'paid', remainingAmount: 0, monthlyPayment: 500_000 })],
      'snowball',
    )
    expect(plan.monthsToDebtFree).toBe(0)
  })

  it('accrues interest on the outstanding balance', () => {
    const plan = simulatePayoff(
      [debt({ id: 'a', remainingAmount: 1_200_000, monthlyPayment: 100_000, interestRate: 12 })],
      'avalanche',
    )
    // 12% a year is 1% a month: the first month accrues 12.000.
    expect(plan.schedule[0].interestPaid).toBeCloseTo(12_000, 0)
    expect(plan.totalInterest).toBeGreaterThan(0)
  })

  it('gives up when the minimum payment never covers the interest', () => {
    const plan = simulatePayoff(
      [debt({ id: 'trap', remainingAmount: 10_000_000, monthlyPayment: 50_000, interestRate: 24 })],
      'avalanche',
    )
    // 2% a month on 10jt is 200.000 of interest against a 50.000 payment.
    expect(plan.monthsToDebtFree).toBeNull()
    expect(plan.schedule.length).toBeLessThan(600)
  })

  // Sized so the two strategies genuinely diverge: a large extra payment would clear
  // both debts in the same month and hide which one was actually targeted.
  const divergentDebts = () => [
    debt({
      id: 'small-cheap',
      name: 'Kecil',
      remainingAmount: 1_000_000,
      monthlyPayment: 50_000,
      interestRate: 3,
    }),
    debt({
      id: 'big-costly',
      name: 'Mahal',
      remainingAmount: 3_000_000,
      monthlyPayment: 100_000,
      interestRate: 30,
    }),
  ]

  it('targets the highest rate first under avalanche', () => {
    const plan = simulatePayoff(divergentDebts(), 'avalanche', 500_000)
    expect(plan.payoffOrder[0].id).toBe('big-costly')
  })

  it('targets the smallest balance first under snowball', () => {
    const plan = simulatePayoff(divergentDebts(), 'snowball', 500_000)
    expect(plan.payoffOrder[0].id).toBe('small-cheap')
  })

  it('rolls a cleared debt’s minimum into the next target', () => {
    const debts = [
      debt({ id: 'a', remainingAmount: 200_000, monthlyPayment: 200_000, interestRate: 0 }),
      debt({ id: 'b', remainingAmount: 1_000_000, monthlyPayment: 200_000, interestRate: 0 }),
    ]
    const plan = simulatePayoff(debts, 'snowball')
    // Month 1 clears A and puts 200.000 into B. From month 2 the freed minimum joins in,
    // so B takes 400.000 a month and clears in month 3 — not the month 6 that
    // 200.000 a month on its own would need.
    expect(plan.monthsToDebtFree).toBe(3)
  })

  it('finishes sooner with an extra monthly payment', () => {
    const debts = [
      debt({ id: 'a', remainingAmount: 2_400_000, monthlyPayment: 200_000, interestRate: 0 }),
    ]
    const base = simulatePayoff(debts, 'avalanche')
    const boosted = simulatePayoff(debts, 'avalanche', 200_000)
    expect(base.monthsToDebtFree).toBe(12)
    expect(boosted.monthsToDebtFree).toBe(6)
  })

  it('does not mutate the caller’s liabilities', () => {
    const debts = [debt({ id: 'a', remainingAmount: 1_000_000, monthlyPayment: 250_000 })]
    simulatePayoff(debts, 'avalanche')
    expect(debts[0].remainingAmount).toBe(1_000_000)
  })
})

describe('comparePayoffStrategies', () => {
  it('shows avalanche costing no more interest than snowball', () => {
    const debts = [
      debt({ id: 'kecil', remainingAmount: 2_000_000, monthlyPayment: 100_000, interestRate: 5 }),
      debt({ id: 'mahal', remainingAmount: 8_000_000, monthlyPayment: 300_000, interestRate: 28 }),
    ]
    const result = comparePayoffStrategies(debts, 500_000)

    expect(result.avalanche.totalInterest).toBeLessThanOrEqual(result.snowball.totalInterest)
    expect(result.interestSaved).toBeGreaterThanOrEqual(0)
  })

  it('reports no difference when there is only one debt', () => {
    const debts = [debt({ id: 'a', remainingAmount: 1_000_000, monthlyPayment: 250_000 })]
    const result = comparePayoffStrategies(debts)
    expect(result.interestSaved).toBeCloseTo(0)
    expect(result.monthsDifference).toBe(0)
  })
})

describe('debtToIncomeRatio', () => {
  it('is the share of income committed to minimum payments', () => {
    const debts = [
      debt({ id: 'a', remainingAmount: 5_000_000, monthlyPayment: 1_000_000 }),
      debt({ id: 'b', remainingAmount: 3_000_000, monthlyPayment: 500_000 }),
    ]
    expect(debtToIncomeRatio(debts, 10_000_000)).toBeCloseTo(15)
  })

  it('ignores debts already cleared', () => {
    const debts = [debt({ id: 'a', remainingAmount: 0, monthlyPayment: 1_000_000 })]
    expect(debtToIncomeRatio(debts, 10_000_000)).toBe(0)
  })

  it('returns zero rather than dividing by zero income', () => {
    expect(debtToIncomeRatio([debt({ id: 'a', remainingAmount: 1, monthlyPayment: 1 })], 0)).toBe(0)
  })
})
