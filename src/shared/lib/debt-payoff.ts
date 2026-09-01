import type { Liability } from '@/shared/types/domain'

export type PayoffStrategy = 'avalanche' | 'snowball'

export interface PayoffMonth {
  month: number
  /** Remaining balance per liability id at the end of this month. */
  balances: Record<string, number>
  totalRemaining: number
  interestPaid: number
}

export interface PayoffPlan {
  strategy: PayoffStrategy
  /** Months to clear every debt. Null when the plan never pays them off. */
  monthsToDebtFree: number | null
  totalInterest: number
  totalPaid: number
  schedule: PayoffMonth[]
  /** Order debts are targeted for the extra payment. */
  payoffOrder: { id: string; name: string; clearedInMonth: number | null }[]
}

/** Runaway guard: 50 years is longer than any consumer loan worth simulating. */
const MAX_MONTHS = 600

/**
 * Simulates paying every debt down month by month.
 *
 * Both strategies pay the minimum on everything, then throw all spare cash at one
 * target debt: avalanche picks the highest interest rate (cheapest overall), snowball
 * the smallest balance (fastest first win). When a debt clears, its minimum payment
 * rolls into the next target — that snowballing is what makes either method beat
 * paying minimums forever.
 */
export function simulatePayoff(
  liabilities: Liability[],
  strategy: PayoffStrategy,
  extraPerMonth = 0,
): PayoffPlan {
  const debts = liabilities
    .filter((item) => item.remainingAmount > 0)
    .map((item) => ({
      id: item.id,
      name: item.name,
      balance: item.remainingAmount,
      // Stored as a percent per year; convert to a monthly fraction.
      monthlyRate: (item.interestRate ?? 0) / 100 / 12,
      minimum: item.monthlyPayment,
    }))

  if (debts.length === 0) {
    return {
      strategy,
      monthsToDebtFree: 0,
      totalInterest: 0,
      totalPaid: 0,
      schedule: [],
      payoffOrder: [],
    }
  }

  const cleared = new Map<string, number>()
  const schedule: PayoffMonth[] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  while (debts.some((debt) => debt.balance > 0) && month < MAX_MONTHS) {
    month += 1
    let interestThisMonth = 0

    // 1. Interest accrues on every outstanding balance first.
    for (const debt of debts) {
      if (debt.balance <= 0) continue
      const interest = debt.balance * debt.monthlyRate
      debt.balance += interest
      interestThisMonth += interest
    }

    // 2. Budget is every minimum payment plus the user's extra. Minimums from cleared
    //    debts stay in the pot — that is the "snowball" that accelerates the plan.
    let budget = debts.reduce((sum, debt) => sum + debt.minimum, 0) + extraPerMonth

    // 3. Pay minimums on everything still open.
    for (const debt of debts) {
      if (debt.balance <= 0) continue
      const payment = Math.min(debt.minimum, debt.balance, budget)
      debt.balance -= payment
      budget -= payment
      totalPaid += payment
      if (debt.balance <= 0.005) {
        debt.balance = 0
        if (!cleared.has(debt.id)) cleared.set(debt.id, month)
      }
    }

    // 4. Everything left goes at the single target debt.
    while (budget > 0.005) {
      const open = debts.filter((debt) => debt.balance > 0)
      if (open.length === 0) break

      const target =
        strategy === 'avalanche'
          ? open.reduce((best, debt) => (debt.monthlyRate > best.monthlyRate ? debt : best))
          : open.reduce((best, debt) => (debt.balance < best.balance ? debt : best))

      const payment = Math.min(budget, target.balance)
      target.balance -= payment
      budget -= payment
      totalPaid += payment

      if (target.balance <= 0.005) {
        target.balance = 0
        if (!cleared.has(target.id)) cleared.set(target.id, month)
      }
    }

    totalInterest += interestThisMonth

    schedule.push({
      month,
      balances: Object.fromEntries(debts.map((debt) => [debt.id, Math.max(0, debt.balance)])),
      totalRemaining: debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0),
      interestPaid: interestThisMonth,
    })

    // Minimums too small to cover the interest mean the balance never falls.
    if (month > 1) {
      const previous = schedule[schedule.length - 2].totalRemaining
      const current = schedule[schedule.length - 1].totalRemaining
      if (current >= previous - 0.005) break
    }
  }

  const debtFree = debts.every((debt) => debt.balance <= 0)

  return {
    strategy,
    monthsToDebtFree: debtFree ? month : null,
    totalInterest,
    totalPaid,
    schedule,
    payoffOrder: debts
      .map((debt) => ({
        id: debt.id,
        name: debt.name,
        clearedInMonth: cleared.get(debt.id) ?? null,
      }))
      .sort((a, b) => (a.clearedInMonth ?? Infinity) - (b.clearedInMonth ?? Infinity)),
  }
}

/** Head-to-head comparison, for the simulator's "which method wins" summary. */
export function comparePayoffStrategies(liabilities: Liability[], extraPerMonth = 0) {
  const avalanche = simulatePayoff(liabilities, 'avalanche', extraPerMonth)
  const snowball = simulatePayoff(liabilities, 'snowball', extraPerMonth)

  return {
    avalanche,
    snowball,
    interestSaved: snowball.totalInterest - avalanche.totalInterest,
    monthsDifference:
      avalanche.monthsToDebtFree !== null && snowball.monthsToDebtFree !== null
        ? snowball.monthsToDebtFree - avalanche.monthsToDebtFree
        : null,
  }
}

/** Debt-to-income: what share of monthly income is already committed to debt. */
export function debtToIncomeRatio(liabilities: Liability[], monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 0
  const committed = liabilities
    .filter((item) => item.remainingAmount > 0)
    .reduce((sum, item) => sum + item.monthlyPayment, 0)
  return (committed / monthlyIncome) * 100
}
