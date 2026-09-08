import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/** §2.1 cap: at most 50 checklist items per task. */
const MAX_ITEMS = 50

/**
 * Appends a checklist item. Empty/whitespace titles and over-cap adds are
 * ignored silently. New item's `order` sits `RANK_GAP` past the current max.
 */
export async function addChecklistItem(
  userId: string,
  task: Task,
  title: string,
): Promise<void> {
  const existing = task.checklist ?? []
  if (existing.length >= MAX_ITEMS) return

  const clean = title.trim().slice(0, 200)
  if (!clean) return

  const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), 0)
  const item = {
    id: crypto.randomUUID(),
    title: clean,
    done: false,
    order: maxOrder + 1000,
  }
  await repositories.tasks.update(userId, task.id, { checklist: [...existing, item] })
}
