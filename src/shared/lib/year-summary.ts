import { daysInMonth } from './budget-math'
import type { Category, MonthlyBudget, Transaction } from '@/shared/types/domain'

export interface MonthHistory {
  year: number
  month: number
  income: number
  /** Money out excluding savings contributions. */
  spending: number
  saved: number
  budget: number
  absorptionRate: number
  transactionCount: number
  /** Distinct days with at least one transaction — the logging-consistency signal. */
  activeDays: number
  hasData: boolean
}

export interface YearSummary {
  year: number
  months: MonthHistory[]
  totalIncome: number
  totalSpending: number
  totalSaved: number
  savingsRate: number
  bestMonth: MonthHistory | null
  worstMonth: MonthHistory | null
  /** Consecutive months with at least one transaction, counting back from the last. */
  loggingStreak: number
}

function isSavings(categoryId: string, categories: Category[]): boolean {
  return categories.find((c) => c.id === categoryId)?.pillar === 'savings'
}

/**
 * Rolls a year of transactions into twelve month buckets.
 *
 * Takes all the year's transactions at once rather than querying month by month —
 * twelve round trips to render one page is the kind of thing that makes a dashboard
 * feel broken on mobile data.
 */
export function buildYearSummary(
  year: number,
  transactions: Transaction[],
  budgets: MonthlyBudget[],
  categories: Category[],
): YearSummary {
  const budgetByMonth = new Map(budgets.map((b) => [b.month, b]))

  const months: MonthHistory[] = []

  for (let month = 1; month <= 12; month += 1) {
    const inMonth = transactions.filter((tx) => {
      const date = tx.date.toDate()
      return date.getFullYear() === year && date.getMonth() + 1 === month
    })

    const income = inMonth.reduce((sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum), 0)

    const saved = inMonth.reduce(
      (sum, tx) =>
        tx.type !== 'income' && isSavings(tx.categoryId, categories) ? sum + tx.amount : sum,
      0,
    )

    const spending = inMonth.reduce(
      (sum, tx) =>
        tx.type !== 'income' && !isSavings(tx.categoryId, categories) ? sum + tx.amount : sum,
      0,
    )

    const budgetDoc = budgetByMonth.get(month)
    const plannedIncome = budgetDoc?.totalIncome ?? 0
    // Budget is what the plan allocated; without a plan, fall back to income booked.
    const budget = plannedIncome || income

    const activeDays = new Set(inMonth.map((tx) => tx.date.toDate().getDate())).size

    months.push({
      year,
      month,
      income: plannedIncome || income,
      spending,
      saved,
      budget,
      absorptionRate: budget > 0 ? ((spending + saved) / budget) * 100 : 0,
      transactionCount: inMonth.length,
      activeDays,
      hasData: inMonth.length > 0 || Boolean(budgetDoc),
    })
  }

  const withData = months.filter((m) => m.hasData && m.income > 0)

  // "Best" is the month that kept the most of its income, not the one that spent least —
  // a month with no income and no spending is not a good month.
  const bySavingsRate = [...withData].sort((a, b) => savingsRateOf(b) - savingsRateOf(a))

  const totalIncome = months.reduce((sum, m) => sum + m.income, 0)
  const totalSpending = months.reduce((sum, m) => sum + m.spending, 0)
  const totalSaved = months.reduce((sum, m) => sum + m.saved, 0)

  return {
    year,
    months,
    totalIncome,
    totalSpending,
    totalSaved,
    savingsRate: totalIncome > 0 ? (totalSaved / totalIncome) * 100 : 0,
    bestMonth: bySavingsRate[0] ?? null,
    worstMonth: bySavingsRate.length > 1 ? bySavingsRate[bySavingsRate.length - 1] : null,
    loggingStreak: countStreak(months),
  }
}

export function savingsRateOf(month: MonthHistory): number {
  return month.income > 0 ? (month.saved / month.income) * 100 : 0
}

/** Consecutive logged months ending at the last month that has any data. */
function countStreak(months: MonthHistory[]): number {
  const logged = months.map((m) => m.transactionCount > 0)
  const lastLogged = logged.lastIndexOf(true)
  if (lastLogged === -1) return 0

  let streak = 0
  for (let index = lastLogged; index >= 0 && logged[index]; index -= 1) streak += 1
  return streak
}

/** Share of the month's days that carry at least one transaction. */
export function consistencyPercent(month: MonthHistory): number {
  const total = daysInMonth(month.year, month.month)
  return total > 0 ? (month.activeDays / total) * 100 : 0
}

export interface CategoryTrendPoint {
  month: number
  amount: number
}

/** Twelve-month spend series for one category. */
export function categoryTrend(
  year: number,
  categoryId: string,
  transactions: Transaction[],
): CategoryTrendPoint[] {
  const points: CategoryTrendPoint[] = []

  for (let month = 1; month <= 12; month += 1) {
    const amount = transactions
      .filter((tx) => {
        if (tx.categoryId !== categoryId || tx.type === 'income') return false
        const date = tx.date.toDate()
        return date.getFullYear() === year && date.getMonth() + 1 === month
      })
      .reduce((sum, tx) => sum + tx.amount, 0)

    points.push({ month, amount })
  }

  return points
}

export interface CategoryDiff {
  categoryId: string
  name: string
  a: number
  b: number
  diff: number
  /** Percent change from A to B. Null when A was zero — "up from nothing" has no ratio. */
  percentChange: number | null
}

/** Per-category diff between two periods, largest movement first. */
export function compareMonths(
  aTransactions: Transaction[],
  bTransactions: Transaction[],
  categories: Category[],
): CategoryDiff[] {
  const sum = (rows: Transaction[], categoryId: string) =>
    rows
      .filter((tx) => tx.categoryId === categoryId && tx.type !== 'income')
      .reduce((total, tx) => total + tx.amount, 0)

  return categories
    .filter((c) => c.pillar !== 'income')
    .map((category) => {
      const a = sum(aTransactions, category.id)
      const b = sum(bTransactions, category.id)
      return {
        categoryId: category.id,
        name: category.name,
        a,
        b,
        diff: b - a,
        percentChange: a > 0 ? ((b - a) / a) * 100 : null,
      }
    })
    .filter((row) => row.a > 0 || row.b > 0)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}
