import { repositories } from '@/shared/repositories'

export interface DeleteCategoryResult {
  movedTransactions: number
}

/**
 * Categories are soft-deleted, never hard-deleted: past months must keep rendering.
 *
 * When `moveToCategoryId` is given, existing transactions are reassigned first so no
 * transaction is left pointing at a hidden category (which would drop it from every
 * total). Without it, the category is only hidden and its history stays attached.
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
  moveToCategoryId?: string,
): Promise<DeleteCategoryResult> {
  if (moveToCategoryId === categoryId) {
    throw new Error('Kategori tujuan harus berbeda')
  }

  let movedTransactions = 0

  if (moveToCategoryId) {
    const target = await repositories.categories.findById(userId, moveToCategoryId)
    if (!target || !target.isActive) throw new Error('Kategori tujuan tidak ditemukan')
    movedTransactions = await repositories.transactions.moveCategory(
      userId,
      categoryId,
      moveToCategoryId,
      target.pillar,
    )
  }

  await repositories.categories.softDelete(userId, categoryId)

  return { movedTransactions }
}
