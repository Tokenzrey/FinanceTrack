import { repositories } from '@/shared/repositories'
import { buildYearSummary, type YearSummary } from '@/shared/lib/year-summary'
import type { Category, Transaction } from '@/shared/types/domain'

export interface YearHistory {
  summary: YearSummary
  transactions: Transaction[]
  categories: Category[]
}

/**
 * A whole year in three queries, not thirty-six.
 *
 * One date-range query covers all twelve months of transactions; the budgets come from
 * a single id-range query because monthly budget ids sort chronologically ("2026-01"…).
 */
export async function getYearHistory(userId: string, year: number): Promise<YearHistory> {
  const from = new Date(year, 0, 1, 0, 0, 0, 0)
  const to = new Date(year, 11, 31, 23, 59, 59, 999)

  const [transactions, budgets, categories] = await Promise.all([
    repositories.transactions.findByDateRange(userId, from, to),
    repositories.budgets.findRange(userId, `${year}-01`, `${year}-12`),
    repositories.categories.findAll(userId),
  ])

  return {
    summary: buildYearSummary(year, transactions, budgets, categories),
    transactions,
    categories,
  }
}
