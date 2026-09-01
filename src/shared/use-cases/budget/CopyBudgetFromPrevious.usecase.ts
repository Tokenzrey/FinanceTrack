import { repositories } from '@/shared/repositories'
import type { MonthlyBudget } from '@/shared/types/domain'

/** Carries income, pillar split and overrides forward. Transactions are never copied. */
export async function copyBudgetFromPrevious(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlyBudget> {
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const source = await repositories.budgets.find(userId, previous.year, previous.month)

  if (!source) {
    throw new Error('Belum ada anggaran bulan sebelumnya untuk disalin')
  }

  return repositories.budgets.upsert(userId, {
    year,
    month,
    totalIncome: source.totalIncome,
    pillarConfig: source.pillarConfig,
    categoryOverrides: source.categoryOverrides,
  })
}
