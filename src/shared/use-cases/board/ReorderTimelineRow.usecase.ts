import { needsRebalance, rankBetween, rebalancedRanks } from '@/shared/lib/rank'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Moves a task to a new row position on the Linimasa view.
 *
 * `timelineOrder` is deliberately separate from the board's `order`: the two
 * projections show the same tasks but answer different questions, and dragging a
 * Gantt row to group related work should not shuffle the Kanban column.
 *
 * `rows` is the currently rendered order (post-removal indices, as `useDragSort`
 * reports them). A collapsed rank gap triggers the same whole-list respace the
 * board uses — one write per row, rare.
 */
export async function reorderTimelineRow(
  userId: string,
  rows: Task[],
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  if (fromIndex === toIndex) return
  const next = [...rows]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return
  const clamped = Math.max(0, Math.min(toIndex, next.length))
  next.splice(clamped, 0, moved)

  const orderOf = (t: Task | undefined, fallbackIndex: number): number | null =>
    t ? (t.timelineOrder ?? fallbackIndex * 1000) : null

  const before = orderOf(next[clamped - 1], clamped - 1)
  const after = orderOf(next[clamped + 1], clamped + 1)
  const newOrder = rankBetween(before, after)

  const merged = next.map((t, i) =>
    t.id === moved.id ? newOrder : (t.timelineOrder ?? i * 1000),
  )

  if (needsRebalance(merged)) {
    const fresh = rebalancedRanks(next.length)
    await Promise.all(
      next.map((t, i) => repositories.tasks.update(userId, t.id, { timelineOrder: fresh[i] })),
    )
    return
  }

  await repositories.tasks.update(userId, moved.id, { timelineOrder: newOrder })
}
