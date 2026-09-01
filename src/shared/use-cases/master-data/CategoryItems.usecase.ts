import { repositories } from '@/shared/repositories'
import type { CategoryItem } from '@/shared/types/domain'
import type { CreateCategoryItemDTO, UpdateCategoryItemDTO } from '@/shared/types/dto'

export async function createCategoryItem(
  userId: string,
  data: CreateCategoryItemDTO,
): Promise<CategoryItem> {
  const name = data.name.trim()
  if (!name) throw new Error('Nama item wajib diisi')
  if (data.recurringDay !== undefined && (data.recurringDay < 1 || data.recurringDay > 31)) {
    throw new Error('Tanggal jatuh tempo harus antara 1 dan 31')
  }
  return repositories.categories.createItem(userId, { ...data, name })
}

export async function updateCategoryItem(
  userId: string,
  id: string,
  data: UpdateCategoryItemDTO,
): Promise<void> {
  await repositories.categories.updateItem(userId, id, data)
}

export async function deleteCategoryItem(userId: string, id: string): Promise<void> {
  await repositories.categories.deleteItem(userId, id)
}
