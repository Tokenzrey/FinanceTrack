import { RANK_GAP } from '@/shared/lib/rank'
import { listForStatus } from '@/shared/lib/task-status-sync'
import { repositories } from '@/shared/repositories'

/**
 * Backfills `listId` + `order` on tasks created before the board existed.
 * Each list-less task is routed to the first column mapping to its status, then
 * ranked `RANK_GAP, 2*RANK_GAP, …` within that column in `createdAt` order.
 *
 * Assumes `seedDefaultBoard` already ran. Idempotent: a second call finds no
 * list-less tasks and writes nothing. Called once on `BoardView` mount (Task 8).
 */
export async function migrateLegacyTasks(userId: string): Promise<void> {
  const lists = await repositories.boardLists.list(userId)
  if (lists.length === 0) return

  const tasks = await repositories.tasks.list(userId, 'all')
  const legacy = tasks.filter((t) => t.listId == null)
  if (legacy.length === 0) return

  const byList = new Map<string, typeof legacy>()
  for (const task of legacy) {
    const listId = listForStatus(task.status, lists)
    if (!listId) continue // no column for this status — leave the task alone
    const group = byList.get(listId) ?? []
    group.push(task)
    byList.set(listId, group)
  }

  for (const [listId, group] of byList) {
    group.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    for (let i = 0; i < group.length; i++) {
      await repositories.tasks.update(userId, group[i].id, {
        listId,
        order: (i + 1) * RANK_GAP,
      })
    }
  }
}
