import { rankBetween } from '@/shared/lib/rank'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Moves a checklist item from `fromIndex` to `toIndex` (indices into the array
 * sorted ascending by `order`, as rendered). The moved item's new `order` is
 * `rankBetween` its neighbours in the reordered array; nothing else is rewritten.
 */
export async function reorderChecklistItem(
  userId: string,
  task: Task,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const sorted = [...(task.checklist ?? [])].sort((a, b) => a.order - b.order)
  if (
    fromIndex < 0 ||
    fromIndex >= sorted.length ||
    toIndex < 0 ||
    toIndex > sorted.length ||
    fromIndex === toIndex
  ) {
    return
  }

  const [moved] = sorted.splice(fromIndex, 1)
  const clamped = Math.max(0, Math.min(toIndex, sorted.length))
  sorted.splice(clamped, 0, moved)

  const before = sorted[clamped - 1]?.order ?? null
  const after = sorted[clamped + 1]?.order ?? null
  const reordered = moved.id === sorted[clamped].id
    ? { ...moved, order: rankBetween(before, after) }
    : moved
  const next = sorted.map((c) => (c.id === reordered.id ? reordered : c))

  await repositories.tasks.update(userId, task.id, { checklist: next })
}
