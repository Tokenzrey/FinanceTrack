import { repositories } from '@/shared/repositories'
import type { Pillar } from '@/shared/types/domain'

export async function reorderCategories(
  userId: string,
  pillar: Pillar,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return
  await repositories.categories.reorder(userId, pillar, orderedIds)
}
