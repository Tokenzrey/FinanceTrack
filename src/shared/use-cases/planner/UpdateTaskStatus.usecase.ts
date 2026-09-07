import { repositories } from '@/shared/repositories'
import { isTaskStatus } from '@/shared/types/productivity'
import type { TaskStatus } from '@/shared/types/productivity'

/** Moves a task between the three board columns. `doneAt` is stamped by the repo. */
export async function updateTaskStatus(
  userId: string,
  id: string,
  status: TaskStatus,
): Promise<void> {
  if (!isTaskStatus(status)) throw new Error('Status tugas tidak valid')

  return repositories.tasks.update(userId, id, { status })
}
