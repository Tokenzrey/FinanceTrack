import { repositories } from '@/shared/repositories'

export async function updateIncome(
  userId: string,
  year: number,
  month: number,
  totalIncome: number,
): Promise<void> {
  if (totalIncome < 0) throw new Error('Pemasukan tidak boleh negatif')
  await repositories.budgets.upsert(userId, { year, month, totalIncome })
}
