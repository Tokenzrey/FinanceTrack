import { buildMonthlySummary, sumByCategory } from '@/shared/lib/budget-math'
import { repositories } from '@/shared/repositories'
import { DEFAULT_PILLAR_CONFIG, type MonthlySummary } from '@/shared/types/domain'

/**
 * The dashboard's single source of truth: pulls budget + categories + this month's and
 * last month's transactions, then hands them to the pure math in `budget-math`.
 */
export async function getMonthlySummary(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlySummary> {
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

  const [budget, categories, transactions, previousTransactions] = await Promise.all([
    repositories.budgets.find(userId, year, month),
    repositories.categories.findAll(userId),
    repositories.transactions.findByMonth(userId, year, month),
    repositories.transactions.findByMonth(userId, previous.year, previous.month),
  ])

  return buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides ?? [],
    previousMonthSpend: sumByCategory(previousTransactions),
  })
}
