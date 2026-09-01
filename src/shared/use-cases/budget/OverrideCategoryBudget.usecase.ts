import { repositories } from '@/shared/repositories'
import type { CategoryBudgetOverride } from '@/shared/types/domain'

/**
 * Inline budget edit on the dashboard category table.
 * Passing `null` clears the override so the category falls back to its own percent.
 */
export async function overrideCategoryBudget(
  userId: string,
  year: number,
  month: number,
  categoryId: string,
  fixedBudget: number | null,
): Promise<void> {
  const budget = await repositories.budgets.find(userId, year, month)
  const existing = budget?.categoryOverrides ?? []
  const rest = existing.filter((o) => o.categoryId !== categoryId)

  const next: CategoryBudgetOverride[] =
    fixedBudget === null ? rest : [...rest, { categoryId, fixedBudget: Math.max(0, fixedBudget) }]

  await repositories.budgets.upsert(userId, { year, month, categoryOverrides: next })
}
