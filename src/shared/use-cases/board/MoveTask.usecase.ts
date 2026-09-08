import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import { needsRebalance, rebalancedRanks } from '@/shared/lib/rank'
import { statusForList } from '@/shared/lib/task-status-sync'
import { repositories } from '@/shared/repositories'
import { colDoc } from '@/shared/repositories/firestore/paths'
import type { BoardList } from '@/shared/types/board'

/**
 * Moves a task to another column at a given fractional `order`.
 *
 * The `status` write keeps the bot's status axis in sync with the board: a card
 * dragged into the "Selesai" column becomes `status:'done'`. `watch` pushes the
 * authoritative state back — callers do not re-fetch.
 *
 * When `destTasks` is supplied and the merged column ordering has a collapsed rank
 * gap (§2.4), the whole destination column is rewritten with `RANK_GAP` spacing in
 * one batch instead of the single move write. Omit `destTasks` to skip the check.
 */
export async function moveTask(
  userId: string,
  taskId: string,
  toListId: string,
  newOrder: number,
  lists: BoardList[],
  destTasks?: { id: string; order?: number }[],
): Promise<void> {
  const status = statusForList(toListId, lists)

  if (destTasks && destTasks.length > 0) {
    const merged = [
      ...destTasks.map((t) => ({ id: t.id, order: t.order ?? 0 })),
      { id: taskId, order: newOrder },
    ].sort((a, b) => a.order - b.order)

    if (needsRebalance(merged.map((t) => t.order))) {
      const fresh = rebalancedRanks(merged.length)
      const batch = writeBatch(getDb())
      merged.forEach((t, i) => {
        batch.update(colDoc(userId, 'tasks', t.id), {
          ...(t.id === taskId
            ? { listId: toListId, status, ...(status === 'done' ? { doneAt: serverTimestamp() } : {}) }
            : {}),
          order: fresh[i],
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      return
    }
  }

  await repositories.tasks.update(userId, taskId, { listId: toListId, order: newOrder, status })
}
