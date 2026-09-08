import { repositories } from '@/shared/repositories'
import { isTaskStatus } from '@/shared/types/productivity'
import type { TaskStatus } from '@/shared/types/productivity'
import type { BoardList } from '@/shared/types/board'
import { listForStatus } from '@/shared/lib/task-status-sync'

/** Moves a task between the three board columns. When `lists` is supplied and the
 *  target status maps to a column, `listId` is written alongside `status` so the
 *  board and the bot's status axis never diverge. `doneAt` is stamped by the repo.
 *  With no `lists` passed, `listForStatus` returns `null` and behaviour is exactly
 *  status-only — safe for callers that don't know about the board. */
export async function updateTaskStatus(
  userId: string,
  id: string,
  status: TaskStatus,
  lists: BoardList[] = [],
): Promise<void> {
  if (!isTaskStatus(status)) throw new Error('Status tugas tidak valid')
  const listId = listForStatus(status, lists)
  return repositories.tasks.update(userId, id, listId ? { status, listId } : { status })
}
