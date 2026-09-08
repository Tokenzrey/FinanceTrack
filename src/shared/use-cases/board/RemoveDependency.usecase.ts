import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Drops `blockerId` from `task.dependsOn` and writes the filtered array back.
 * No-op (no write) when the id wasn't a blocker.
 */
export async function removeDependency(
  userId: string,
  task: Task,
  blockerId: string,
): Promise<void> {
  const current = task.dependsOn ?? []
  const next = current.filter((id) => id !== blockerId)
  if (next.length === current.length) return
  await repositories.tasks.update(userId, task.id, { dependsOn: next })
}
