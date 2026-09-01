import { repositories } from '@/shared/repositories'
import { assertMonthOpen } from '@/shared/lib/month-lock'
import type { Transaction } from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'

/**
 * The pillar always follows the chosen category, so a transaction can never land in a
 * pillar its category does not belong to (which would corrupt every pillar chart).
 */
export async function addTransaction(
  userId: string,
  data: CreateTransactionDTO,
): Promise<Transaction> {
  if (data.amount <= 0) throw new Error('Jumlah harus lebih dari nol')

  await assertMonthOpen(userId, data.date)

  const category = await repositories.categories.findById(userId, data.categoryId)
  if (!category) throw new Error('Kategori tidak ditemukan')

  return repositories.transactions.create(userId, { ...data, pillar: category.pillar })
}
