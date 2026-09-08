import { statusForList } from '@/shared/lib/task-status-sync'
import { repositories } from '@/shared/repositories'
import type { BoardList } from '@/shared/types/board'

/**
 * Moves a task to another column at a given fractional `order`.
 *
 * The `status` write keeps the bot's status axis in sync with the board: a card
 * dragged into the "Selesai" column becomes `status:'done'`. `watch` pushes the
 * authoritative state back — callers do not re-fetch.
 */
export async function moveTask(
  userId: string,
  taskId: string,
  toListId: string,
  newOrder: number,
  lists: BoardList[],
): Promise<void> {
  const status = statusForList(toListId, lists)
  await repositories.tasks.update(userId, taskId, { listId: toListId, order: newOrder, status })
}
