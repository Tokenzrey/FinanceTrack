import type {
  BudgetStatus,
  Category,
  CategoryBudgetOverride,
  CategorySummary,
  MonthlySummary,
  Pillar,
  PillarConfig,
  Transaction,
} from '@/shared/types/domain'

/**
 * Budget arithmetic for the whole app. Pure functions only — no Firestore, no React —
 * so every dashboard number has one definition and one place to test it.
 */

/** Absorption thresholds (% of a category budget already spent). */
export const STATUS_THRESHOLDS = { warning: 80, danger: 100 } as const

export function statusFor(absorptionRate: number): BudgetStatus {
  if (absorptionRate > STATUS_THRESHOLDS.danger) return 'exceeded'
  if (absorptionRate >= STATUS_THRESHOLDS.danger) return 'danger'
  if (absorptionRate >= STATUS_THRESHOLDS.warning) return 'warning'
  return 'safe'
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Days still left to spend in the period, inclusive of today.
 * A past month has 0 left; a future month has the whole month.
 */
export function daysLeftInMonth(year: number, month: number, today = new Date()): number {
  const total = daysInMonth(year, month)
  const isSameMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  if (isSameMonth) return total - today.getDate() + 1
  const monthStart = new Date(year, month - 1, 1)
  return today > monthStart ? 0 : total
}

/** Days already elapsed in the period, minimum 1 so burn-rate never divides by zero. */
export function daysElapsedInMonth(year: number, month: number, today = new Date()): number {
  const total = daysInMonth(year, month)
  const isSameMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  if (isSameMonth) return Math.max(1, today.getDate())
  const monthStart = new Date(year, month - 1, 1)
  return today > monthStart ? total : 1
}

/**
 * Budget for one category.
 * Precedence: fixed override > percent override > the category's own percentOfIncome.
 * All percents are percent-of-total-income, matching the master-data editor.
 */
export function budgetForCategory(
  category: Category,
  totalIncome: number,
  overrides: CategoryBudgetOverride[] = [],
): number {
  const override = overrides.find((o) => o.categoryId === category.id)
  if (override?.fixedBudget !== undefined) return Math.max(0, override.fixedBudget)
  const percent = override?.percentOverride ?? category.percentOfIncome
  return Math.max(0, (totalIncome * percent) / 100)
}

/** Income split across the three spend pillars, e.g. 50/30/20. */
export function pillarBudgets(totalIncome: number, config: PillarConfig): Record<Pillar, number> {
  return {
    income: totalIncome,
    needs: totalIncome * config.needs,
    wants: totalIncome * config.wants,
    savings: totalIncome * config.savings,
  }
}

/** Signed contribution of a transaction to "money spent" in its category. */
function spentAmount(tx: Transaction): number {
  if (tx.type === 'income') return 0
  return tx.amount
}

export function sumByCategory(transactions: Transaction[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const tx of transactions) {
    const amount = spentAmount(tx)
    if (amount === 0) continue
    totals[tx.categoryId] = (totals[tx.categoryId] ?? 0) + amount
  }
  return totals
}

export function totalIncomeOf(transactions: Transaction[]): number {
  return transactions.reduce((sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum), 0)
}

export interface CategorySummaryOptions {
  year: number
  month: number
  totalIncome: number
  overrides?: CategoryBudgetOverride[]
  /** Spend per category in the previous month, for the vsLastMonth trend. */
  previousMonthSpend?: Record<string, number>
  today?: Date
}

export function buildCategorySummary(
  category: Category,
  transactions: Transaction[],
  options: CategorySummaryOptions,
): CategorySummary {
  const { year, month, totalIncome, overrides = [], previousMonthSpend = {}, today } = options

  const budget = budgetForCategory(category, totalIncome, overrides)
  const used = transactions
    .filter((tx) => tx.categoryId === category.id)
    .reduce((sum, tx) => sum + spentAmount(tx), 0)

  const remaining = budget - used
  const absorptionRate = budget > 0 ? (used / budget) * 100 : used > 0 ? 100 : 0

  const elapsed = daysElapsedInMonth(year, month, today)
  const left = daysLeftInMonth(year, month, today)
  const dailyBurnRate = used / elapsed
  const projectedMonthEnd = dailyBurnRate * daysInMonth(year, month)
  const dailyAllowanceLeft = left > 0 ? Math.max(0, remaining) / left : 0

  const lastMonth = previousMonthSpend[category.id] ?? 0
  const vsLastMonth = lastMonth > 0 ? ((used - lastMonth) / lastMonth) * 100 : 0
  const trend = Math.abs(vsLastMonth) < 5 ? 'stable' : vsLastMonth > 0 ? 'up' : 'down'

  return {
    category,
    budget,
    used,
    remaining,
    absorptionRate,
    dailyBurnRate,
    projectedMonthEnd,
    daysLeft: left,
    dailyAllowanceLeft,
    status: statusFor(absorptionRate),
    trend,
    vsLastMonth,
  }
}

export interface MonthlySummaryOptions extends Omit<CategorySummaryOptions, 'totalIncome'> {
  /** Planned income for the month. Falls back to income transactions when 0. */
  totalIncome: number
  pillarConfig: PillarConfig
}

export function buildMonthlySummary(
  categories: Category[],
  transactions: Transaction[],
  options: MonthlySummaryOptions,
): MonthlySummary {
  const { year, month, pillarConfig, today } = options
  const totalIncome = options.totalIncome || totalIncomeOf(transactions)

  const active = categories.filter((c) => c.isActive)
  const summaries = active.map((category) =>
    buildCategorySummary(category, transactions, { ...options, totalIncome }),
  )

  const spendSummaries = summaries.filter((s) => s.category.pillar !== 'income')
  const totalBudget = spendSummaries.reduce((sum, s) => sum + s.budget, 0)
  const totalUsed = spendSummaries.reduce((sum, s) => sum + s.used, 0)
  const totalSaved = summaries
    .filter((s) => s.category.pillar === 'savings')
    .reduce((sum, s) => sum + s.used, 0)

  // Money that left the wallet — savings contributions are not "spending".
  const spendingOutsideSavings = totalUsed - totalSaved
  const netCashFlow = totalIncome - totalUsed
  const savingsRate = totalIncome > 0 ? (totalSaved / totalIncome) * 100 : 0
  const dailyAvgSpend = spendingOutsideSavings / daysElapsedInMonth(year, month, today)

  const top = [...spendSummaries].sort((a, b) => b.used - a.used)[0]

  const pillarSummary = {
    income: { budget: totalIncome, used: totalIncomeOf(transactions) },
    needs: { budget: totalIncome * pillarConfig.needs, used: 0 },
    wants: { budget: totalIncome * pillarConfig.wants, used: 0 },
    savings: { budget: totalIncome * pillarConfig.savings, used: 0 },
  } satisfies Record<Pillar, { budget: number; used: number }>

  for (const summary of spendSummaries) {
    pillarSummary[summary.category.pillar].used += summary.used
  }

  return {
    year,
    month,
    totalIncome,
    totalBudget,
    totalUsed,
    totalSaved,
    netCashFlow,
    savingsRate,
    dailyAvgSpend,
    topSpendingCategory: top?.category.name ?? '',
    categories: summaries,
    pillarSummary,
  }
}

// ─── Cumulative Curve ────────────────────────────────────────────

export interface CumulativePoint {
  day: number
  /** Cumulative spend up to and including this day. Null after today — no data yet. */
  actual: number | null
  /** Straight-line pace that lands exactly on the budget at month end. */
  plan: number
}

/**
 * Actual vs planned cumulative spending, one point per day of the month.
 *
 * `actual` stops at today rather than flat-lining to the month end: a flat tail reads
 * as "spent nothing for two weeks" instead of "hasn't happened yet".
 */
export function cumulativeCurve(
  transactions: Transaction[],
  options: { year: number; month: number; totalBudget: number; today?: Date },
): CumulativePoint[] {
  const { year, month, totalBudget, today = new Date() } = options
  const total = daysInMonth(year, month)

  const perDay = new Array<number>(total + 1).fill(0)
  for (const tx of transactions) {
    const amount = spentAmount(tx)
    if (amount === 0) continue
    const day = tx.date.toDate().getDate()
    if (day >= 1 && day <= total) perDay[day] += amount
  }

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const isPast = !isCurrentMonth && new Date(year, month - 1, 1) < today
  const lastKnownDay = isCurrentMonth ? today.getDate() : isPast ? total : 0

  const points: CumulativePoint[] = []
  let running = 0

  for (let day = 1; day <= total; day += 1) {
    running += perDay[day]
    points.push({
      day,
      actual: day <= lastKnownDay ? running : null,
      plan: (totalBudget / total) * day,
    })
  }

  return points
}

// ─── Financial Health Score ──────────────────────────────────────

export interface HealthScoreInput {
  savingsRate: number // %
  budgetAdherence: number // % of categories within budget
  emergencyFundProgress: number // % toward 3x monthly income
  debtToIncomeRatio: number // % of income servicing debt
  consistency: number // % of days with at least one logged transaction
  moodPositiveRate: number // % of transactions not marked "regret"
}

export const HEALTH_WEIGHTS = {
  savingsRate: 0.25,
  budgetAdherence: 0.25,
  emergencyFundProgress: 0.2,
  debtToIncomeRatio: 0.15,
  consistency: 0.1,
  moodPositiveRate: 0.05,
} as const

const clamp100 = (n: number) => Math.max(0, Math.min(100, n))

/** 0-100 weighted score. Savings rate hits 100 at the 20% target; debt scores inversely. */
export function financialHealthScore(input: HealthScoreInput): {
  total: number
  breakdown: Record<keyof HealthScoreInput, number>
} {
  const breakdown = {
    savingsRate: clamp100((input.savingsRate / 20) * 100),
    budgetAdherence: clamp100(input.budgetAdherence),
    emergencyFundProgress: clamp100(input.emergencyFundProgress),
    // 0% DTI = perfect, 40%+ = zero.
    debtToIncomeRatio: clamp100(100 - (input.debtToIncomeRatio / 40) * 100),
    consistency: clamp100(input.consistency),
    moodPositiveRate: clamp100(input.moodPositiveRate),
  }

  const total = (Object.keys(breakdown) as (keyof HealthScoreInput)[]).reduce(
    (sum, key) => sum + breakdown[key] * HEALTH_WEIGHTS[key],
    0,
  )

  return { total: Math.round(total), breakdown }
}
