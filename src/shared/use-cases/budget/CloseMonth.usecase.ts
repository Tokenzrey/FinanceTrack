import { repositories } from '@/shared/repositories'

/**
 * Marks a month closed. Enforced (not just a badge): AddTransaction, EditTransaction,
 * DeleteTransaction, recurring generation, and wishlist purchases all reject writes that
 * would land in a closed month — see `assertMonthOpen` in `shared/lib/month-lock.ts`.
 */
export async function closeMonth(userId: string, year: number, month: number): Promise<void> {
  await repositories.budgets.upsert(userId, { year, month })
  await repositories.budgets.closeMonth(userId, year, month)
}

/** Undoes closeMonth. A lock with no key would trap a user who closed a month by mistake. */
export async function reopenMonth(userId: string, year: number, month: number): Promise<void> {
  await repositories.budgets.reopenMonth(userId, year, month)
}
