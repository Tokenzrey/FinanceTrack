import { Timestamp } from 'firebase/firestore'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Appends a timestamped progress note (inline on the task doc — R1). The panel
 * sorts newest-first for display; storage order is append order.
 */
export async function addProgressNote(
  userId: string,
  task: Task,
  body: string,
): Promise<void> {
  const clean = body.trim().slice(0, 2000)
  if (!clean) return

  const note = {
    id: crypto.randomUUID(),
    body: clean,
    createdAt: Timestamp.now(),
  }
  await repositories.tasks.update(userId, task.id, {
    progressNotes: [...(task.progressNotes ?? []), note],
  })
}
