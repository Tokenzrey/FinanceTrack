import type {
  Category,
  CategorySummary,
  PaymentMethod,
  SavingsGoal,
  SpendingMood,
  Transaction,
} from '@/shared/types/domain'

/** Spend per merchant, biggest first. */
export interface MerchantStat {
  name: string
  total: number
  count: number
  average: number
}

export function topMerchants(transactions: Transaction[], limit = 10): MerchantStat[] {
  const byName = new Map<string, { total: number; count: number }>()

  for (const tx of transactions) {
    if (tx.type === 'income') continue
    const name = tx.location?.trim()
    if (!name) continue

    // Case-insensitive grouping: "Indomaret" and "indomaret" are one merchant.
    const key = name.toLowerCase()
    const current = byName.get(key) ?? { total: 0, count: 0 }
    byName.set(key, { total: current.total + tx.amount, count: current.count + 1 })
  }

  const display = new Map<string, string>()
  for (const tx of transactions) {
    const name = tx.location?.trim()
    if (name && !display.has(name.toLowerCase())) display.set(name.toLowerCase(), name)
  }

  return [...byName.entries()]
    .map(([key, value]) => ({
      name: display.get(key) ?? key,
      total: value.total,
      count: value.count,
      average: value.total / value.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export interface MoodStat {
  mood: SpendingMood | 'unset'
  total: number
  count: number
}

/** Spending grouped by how the user felt about it. */
export function moodBreakdown(transactions: Transaction[]): MoodStat[] {
  const buckets: Record<string, MoodStat> = {
    happy: { mood: 'happy', total: 0, count: 0 },
    neutral: { mood: 'neutral', total: 0, count: 0 },
    regret: { mood: 'regret', total: 0, count: 0 },
    unset: { mood: 'unset', total: 0, count: 0 },
  }

  for (const tx of transactions) {
    if (tx.type === 'income') continue
    const bucket = buckets[tx.mood ?? 'unset']
    bucket.total += tx.amount
    bucket.count += 1
  }

  return Object.values(buckets).filter((bucket) => bucket.count > 0)
}

/** Total the user marked as regretted — the number the "could have saved" line uses. */
export function regretTotal(transactions: Transaction[]): number {
  return transactions
    .filter((tx) => tx.type !== 'income' && tx.mood === 'regret')
    .reduce((sum, tx) => sum + tx.amount, 0)
}

export interface PaymentMethodStat {
  method: PaymentMethod | 'unset'
  total: number
  count: number
  percent: number
}

export function paymentMethodBreakdown(transactions: Transaction[]): PaymentMethodStat[] {
  const byMethod = new Map<string, { total: number; count: number }>()

  for (const tx of transactions) {
    if (tx.type === 'income') continue
    const key = tx.paymentMethod ?? 'unset'
    const current = byMethod.get(key) ?? { total: 0, count: 0 }
    byMethod.set(key, { total: current.total + tx.amount, count: current.count + 1 })
  }

  const grandTotal = [...byMethod.values()].reduce((sum, entry) => sum + entry.total, 0)

  return [...byMethod.entries()]
    .map(([method, value]) => ({
      method: method as PaymentMethod | 'unset',
      total: value.total,
      count: value.count,
      percent: grandTotal > 0 ? (value.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/** Spend per tag, for the tag cloud. */
export function tagBreakdown(transactions: Transaction[]): { tag: string; total: number }[] {
  const byTag = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.type === 'income') continue
    for (const tag of tx.tags) {
      byTag.set(tag, (byTag.get(tag) ?? 0) + tx.amount)
    }
  }

  return [...byTag.entries()]
    .map(([tag, total]) => ({ tag, total }))
    .sort((a, b) => b.total - a.total)
}

/** Categories whose current pace lands them over budget before the month ends. */
export function burnRateAlerts(summaries: CategorySummary[]): CategorySummary[] {
  return summaries
    .filter((row) => row.category.pillar !== 'income')
    .filter((row) => row.budget > 0 && row.projectedMonthEnd > row.budget)
    .sort((a, b) => b.projectedMonthEnd - b.budget - (a.projectedMonthEnd - a.budget))
}

/** Treemap input: every spending category sized by what it used. */
export function spendingTreemap(
  summaries: CategorySummary[],
): { name: string; size: number; color: string }[] {
  return summaries
    .filter((row) => row.category.pillar !== 'income' && row.used > 0)
    .map((row) => ({ name: row.category.name, size: row.used, color: row.category.color }))
    .sort((a, b) => b.size - a.size)
}

export interface SavingsProjection {
  monthsToTarget: number | null
  projectedDate: Date | null
  shortfallPerMonth: number
}

/**
 * How long a goal takes at a given monthly contribution.
 *
 * Returns null when the contribution is zero or negative — "never" is the honest
 * answer, and dividing by it would produce Infinity months.
 */
export function projectSavings(
  currentAmount: number,
  targetAmount: number,
  monthlyContribution: number,
  from = new Date(),
): SavingsProjection {
  const remaining = targetAmount - currentAmount

  if (remaining <= 0) {
    return { monthsToTarget: 0, projectedDate: from, shortfallPerMonth: 0 }
  }
  if (monthlyContribution <= 0) {
    return { monthsToTarget: null, projectedDate: null, shortfallPerMonth: remaining }
  }

  const months = Math.ceil(remaining / monthlyContribution)
  const projectedDate = new Date(from.getFullYear(), from.getMonth() + months, from.getDate())

  return { monthsToTarget: months, projectedDate, shortfallPerMonth: 0 }
}

/** Contribution needed to hit a goal by its target date. */
export function requiredContribution(goal: SavingsGoal, from = new Date()): number | null {
  if (!goal.targetDate) return null

  const target = goal.targetDate.toDate()
  const months =
    (target.getFullYear() - from.getFullYear()) * 12 + (target.getMonth() - from.getMonth())

  if (months <= 0) return null

  const remaining = goal.targetAmount - goal.currentAmount
  return remaining > 0 ? remaining / months : 0
}

export interface WhatIfResult {
  categoryId: string
  categoryName: string
  currentSpend: number
  newSpend: number
  monthlySaving: number
  yearlySaving: number
}

/**
 * "If I cut this category by X%, what do I free up?"
 *
 * Reports the freed cash only. It deliberately does not claim a new goal date —
 * that depends on which goal the money goes to, which is the user's choice.
 */
export function simulateCut(
  summaries: CategorySummary[],
  categoryId: string,
  cutPercent: number,
): WhatIfResult | null {
  const row = summaries.find((item) => item.category.id === categoryId)
  if (!row) return null

  const clamped = Math.max(0, Math.min(100, cutPercent))
  const monthlySaving = (row.used * clamped) / 100

  return {
    categoryId,
    categoryName: row.category.name,
    currentSpend: row.used,
    newSpend: row.used - monthlySaving,
    monthlySaving,
    yearlySaving: monthlySaving * 12,
  }
}

/**
 * Whether savings outpace inflation.
 *
 * Compares the savings rate against annual inflation. A positive gap means the
 * money set aside this year grows faster than prices.
 */
export function realSavingsGap(savingsRatePercent: number, inflationPercent: number): number {
  return savingsRatePercent - inflationPercent
}

/** Share of days in the period that carry at least one transaction. */
export function loggingConsistency(transactions: Transaction[], totalDays: number): number {
  if (totalDays <= 0) return 0
  const days = new Set(
    transactions.map((tx) => {
      const date = tx.date.toDate()
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    }),
  )
  return Math.min(100, (days.size / totalDays) * 100)
}

/** Liquid assets available as an emergency buffer. */
export function liquidAssets(assets: { type: string; value: number }[]): number {
  const LIQUID = new Set(['cash', 'savings'])
  return assets
    .filter((asset) => LIQUID.has(asset.type))
    .reduce((sum, asset) => sum + asset.value, 0)
}

/** Progress toward the conventional 3-months-of-expenses emergency fund. */
export function emergencyFundProgress(liquid: number, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return liquid > 0 ? 100 : 0
  return Math.min(100, (liquid / (monthlyExpenses * 3)) * 100)
}

export interface BudgetEfficiency {
  categoryId: string
  name: string
  /** 0-100. 100 = spent the budget almost exactly; penalised for both over- and under-use. */
  score: number
  absorptionRate: number
  status: 'over' | 'under' | 'efficient'
}

/**
 * How well a category's spending matched its budget — not just "under budget is good".
 *
 * A category sitting at 20% absorption every month is not "safe", it is a plan that
 * over-allocated it; one at 140% is overspent. Both cost points; only the band close to
 * 100% (without crossing it) scores near the top, which is what "efficient" means here.
 */
export function budgetEfficiencyScores(summaries: CategorySummary[]): BudgetEfficiency[] {
  return summaries
    .filter((row) => row.category.pillar !== 'income' && row.budget > 0)
    .map((row) => {
      const rate = row.absorptionRate
      let score: number
      let status: BudgetEfficiency['status']

      if (rate > 100) {
        // Past 100%, score falls off fast — capped at 0 by 150%.
        score = Math.max(0, 100 - (rate - 100) * 2)
        status = 'over'
      } else {
        // Below 100%, score falls off the further short of the budget it lands.
        score = Math.max(0, 100 - (100 - rate) * 0.8)
        status = rate < 60 ? 'under' : 'efficient'
      }

      return {
        categoryId: row.category.id,
        name: row.category.name,
        score: Math.round(score),
        absorptionRate: rate,
        status,
      }
    })
    .sort((a, b) => a.score - b.score)
}

/** Categories a user tends to overspend, by how often they exceeded their budget. */
export function seasonalityByCategory(
  year: number,
  transactions: Transaction[],
  categories: Category[],
): { categoryId: string; name: string; peakMonth: number; peakAmount: number }[] {
  return categories
    .filter((category) => category.pillar !== 'income')
    .map((category) => {
      const perMonth = new Array<number>(12).fill(0)

      for (const tx of transactions) {
        if (tx.categoryId !== category.id || tx.type === 'income') continue
        const date = tx.date.toDate()
        if (date.getFullYear() !== year) continue
        perMonth[date.getMonth()] += tx.amount
      }

      const peakAmount = Math.max(...perMonth)
      return {
        categoryId: category.id,
        name: category.name,
        peakMonth: perMonth.indexOf(peakAmount) + 1,
        peakAmount,
      }
    })
    .filter((row) => row.peakAmount > 0)
    .sort((a, b) => b.peakAmount - a.peakAmount)
}
