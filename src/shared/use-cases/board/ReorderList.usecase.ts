import { repositories } from '@/shared/repositories'

/** Sets a column's fractional `order`. `watch` pushes the re-sorted list back. */
export async function reorderList(
  userId: string,
  listId: string,
  newOrder: number,
): Promise<void> {
  await repositories.boardLists.update(userId, listId, { order: newOrder })
}
