import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Flips one checklist item's `done` flag and writes the whole array back.
 * The panel holds the current `Task`, so we compute the next array here — no
 * re-fetch; `watch` pushes the authoritative state.
 */
export async function toggleChecklistItem(
  userId: string,
  task: Task,
  itemId: string,
): Promise<void> {
  const next = (task.checklist ?? []).map((c) =>
    c.id === itemId ? { ...c, done: !c.done } : c,
  )
  await repositories.tasks.update(userId, task.id, { checklist: next })
}
