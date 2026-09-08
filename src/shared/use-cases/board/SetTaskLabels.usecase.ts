import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

const MAX_LABELS = 6 // §2.1

/** Sets a task's labels. Silently caps at 6 (§2.1) — a 7th toggle-on is dropped. */
export async function setTaskLabels(userId: string, task: Task, labelIds: string[]): Promise<void> {
  await repositories.tasks.update(userId, task.id, { labelIds: labelIds.slice(0, MAX_LABELS) })
}
