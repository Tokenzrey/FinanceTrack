import { calculateAffordability } from '@/shared/lib/affordability'
import { liquidAssets } from '@/shared/lib/analytics'
import { repositories } from '@/shared/repositories'
import { getMonthlySummary } from '@/shared/use-cases/budget/GetMonthlySummary.usecase'
import type { SmartAffordabilityResult, Wishlist } from '@/shared/types/wishlist.types'

/**
 * The financial position every affordability calculation is measured against.
 * Fetched once and reused across the whole wishlist rather than per item.
 */
export interface FinancialContext {
  liquidAssets: number
  existingMonthlyDebt: number
  monthlyIncome: number
  monthlyExpenses: number
  remainingBudget: number
}

export async function getFinancialContext(
  userId: string,
  year: number,
  month: number,
): Promise<FinancialContext> {
  const [summary, assets, liabilities] = await Promise.all([
    getMonthlySummary(userId, year, month),
    repositories.netWorth.findAssets(userId),
    repositories.netWorth.findLiabilities(userId),
  ])

  // Savings contributions are money kept, so they are not "expenses" for the
  // three-month emergency-fund floor.
  const monthlyExpenses = summary.totalUsed - summary.totalSaved

  return {
    liquidAssets: liquidAssets(assets),
    existingMonthlyDebt: liabilities
      .filter((item) => item.remainingAmount > 0)
      .reduce((sum, item) => sum + item.monthlyPayment, 0),
    monthlyIncome: summary.totalIncome,
    monthlyExpenses,
    remainingBudget: Math.max(0, summary.totalBudget - summary.totalUsed),
  }
}

/** Runs the engine for one wishlist item against the shared context. */
export function analyseWishlistItem(
  item: Wishlist,
  context: FinancialContext,
): SmartAffordabilityResult {
  return calculateAffordability({
    price: item.estimatedPrice,
    financingMethod: item.financingMethod,
    monthlyInstallment: item.estimatedMonthlyInstallment,
    ...context,
  })
}
