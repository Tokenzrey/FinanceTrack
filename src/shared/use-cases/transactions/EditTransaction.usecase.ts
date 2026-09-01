import { repositories } from '@/shared/repositories'
import { assertMonthOpen } from '@/shared/lib/month-lock'
import type { UpdateTransactionDTO } from '@/shared/types/dto'

export async function editTransaction(
  userId: string,
  id: string,
  data: UpdateTransactionDTO,
): Promise<void> {
  if (data.amount !== undefined && data.amount <= 0) {
    throw new Error('Jumlah harus lebih dari nol')
  }

  const existing = await repositories.transactions.findById(userId, id)
  if (!existing) throw new Error('Transaksi tidak ditemukan')

  // Guard the record's current month — editing an amount, say, must not slip past a
  // closed month just because the date itself is not part of this patch.
  await assertMonthOpen(userId, existing.date.toDate())
  // A date change can move the record into (or out of) a different, possibly closed, month.
  if (data.date) await assertMonthOpen(userId, data.date)

  // Moving a transaction to another category moves its pillar too.
  let patch = data
  if (data.categoryId) {
    const category = await repositories.categories.findById(userId, data.categoryId)
    if (!category) throw new Error('Kategori tidak ditemukan')
    patch = { ...data, pillar: category.pillar }
  }

  await repositories.transactions.update(userId, id, patch)
}
