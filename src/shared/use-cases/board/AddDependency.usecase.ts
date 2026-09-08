import { wouldCreateCycle } from '@/shared/lib/task-graph'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/** §2.1 cap: at most 20 dependencies per task. */
const MAX_DEPS = 20

/**
 * Adds `blockerId` to `task.dependsOn`. Rejects (throws `Error` with a message
 * that names the offending chain) if it would form a cycle; also rejects a
 * self-link, an unknown target, and an over-cap add. Idempotent: adding a
 * blocker already present is a no-op (no throw, no write).
 */
export async function addDependency(
  userId: string,
  task: Task,
  blockerId: string,
  allTasks: Task[],
): Promise<void> {
  if (blockerId === task.id) {
    throw new Error('Tugas tidak bisa bergantung pada dirinya sendiri.')
  }
  if (!allTasks.some((t) => t.id === blockerId)) {
    throw new Error('Tugas tujuan tidak ditemukan.')
  }

  const current = task.dependsOn ?? []
  if (current.includes(blockerId)) return
  if (current.length >= MAX_DEPS) {
    throw new Error(`Maksimal ${MAX_DEPS} dependency per tugas.`)
  }

  const cycle = wouldCreateCycle(task.id, blockerId, allTasks)
  if (cycle) {
    const titleById = new Map(allTasks.map((t) => [t.id, t.title]))
    const readable = cycle.map((id) => titleById.get(id) ?? id).join(' → ')
    throw new Error(`Tidak bisa — akan membentuk lingkaran: ${readable}`)
  }

  await repositories.tasks.update(userId, task.id, { dependsOn: [...current, blockerId] })
}
