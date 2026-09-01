import { repositories } from '@/shared/repositories'
import type { UpdateCategoryDTO } from '@/shared/types/dto'

export async function updateCategory(
  userId: string,
  id: string,
  data: UpdateCategoryDTO,
): Promise<void> {
  if (
    data.percentOfIncome !== undefined &&
    (data.percentOfIncome < 0 || data.percentOfIncome > 100)
  ) {
    throw new Error('Persentase harus antara 0 dan 100')
  }
  await repositories.categories.update(userId, id, {
    ...data,
    ...(data.name ? { name: data.name.trim() } : {}),
  })
}
