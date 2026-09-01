import { budgetForCategory, pillarBudgets } from '@/shared/lib/budget-math'
import type { Category, MonthlyBudget, Pillar } from '@/shared/types/domain'

export interface CategoryBudgetLine {
  category: Category
  budget: number
  percentOfIncome: number
}

/**
 * Budget per category for a month, plus the pillar ceilings.
 * `overAllocated` flags a plan whose categories already exceed the pillar ceiling —
 * the master-data screen warns on it instead of silently letting the plan not add up.
 */
export function calculateBudget(categories: Category[], budget: MonthlyBudget | null) {
  const totalIncome = budget?.totalIncome ?? 0
  const overrides = budget?.categoryOverrides ?? []

  const lines: CategoryBudgetLine[] = categories
    .filter((c) => c.isActive && c.pillar !== 'income')
    .map((category) => {
      const amount = budgetForCategory(category, totalIncome, overrides)
      return {
        category,
        budget: amount,
        percentOfIncome: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
      }
    })

  const ceilings = pillarBudgets(
    totalIncome,
    budget?.pillarConfig ?? { needs: 0.5, wants: 0.3, savings: 0.2 },
  )

  const allocated = { income: 0, needs: 0, wants: 0, savings: 0 } as Record<Pillar, number>
  for (const line of lines) allocated[line.category.pillar] += line.budget

  const overAllocated = (['needs', 'wants', 'savings'] as const).filter(
    (pillar) => allocated[pillar] > ceilings[pillar] + 1,
  )

  return {
    totalIncome,
    lines,
    ceilings,
    allocated,
    totalAllocated: lines.reduce((sum, l) => sum + l.budget, 0),
    unallocated: totalIncome - lines.reduce((sum, l) => sum + l.budget, 0),
    overAllocated,
  }
}
