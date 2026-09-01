import { repositories } from '@/shared/repositories'
import { assertMonthOpen } from '@/shared/lib/month-lock'

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const existing = await repositories.transactions.findById(userId, id)
  if (existing) await assertMonthOpen(userId, existing.date.toDate())
  await repositories.transactions.delete(userId, id)
}

/**
 * Rejects the whole batch if any selected transaction sits in a closed month, rather
 * than silently deleting the open ones and skipping the rest — a partial bulk-delete
 * with no explanation is more confusing than one clear error naming the blocker.
 */
export async function bulkDeleteTransactions(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const records = await Promise.all(ids.map((id) => repositories.transactions.findById(userId, id)))
  for (const record of records) {
    if (record) await assertMonthOpen(userId, record.date.toDate())
  }

  await repositories.transactions.bulkDelete(userId, ids)
}
