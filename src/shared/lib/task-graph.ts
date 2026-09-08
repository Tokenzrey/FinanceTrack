import type { Task } from '@/shared/types/productivity'

/**
 * The dependency graph: an edge `A → B` means "A depends on B" (A is blocked by
 * B). Adding `fromId → toId` forms a cycle iff `toId` can already reach `fromId`
 * by following existing `dependsOn` edges.
 *
 * Returns the offending chain of ids in "who depends on whom" order, first ===
 * last, listing every node in the cycle once in between — e.g. for A dep B, B
 * dep C, adding C dep A returns `['C', 'A', 'B', 'C']` (C depends on A, A on B, B
 * on C, back to C). Returns null when the edge is safe.
 *
 * `fromId === toId` is a cycle → returns `[fromId, fromId]`.
 *
 * A `visited` set guards the traversal so a pre-existing malformed cycle in the
 * data can't hang it. Ids in `dependsOn` that aren't real tasks are ignored
 * (dangling — can't be part of a cycle through known nodes).
 */
export function wouldCreateCycle(fromId: string, toId: string, tasks: Task[]): string[] | null {
  if (fromId === toId) return [fromId, fromId]

  const known = new Set(tasks.map((t) => t.id))
  const deps = new Map<string, string[]>()
  for (const t of tasks) {
    deps.set(t.id, (t.dependsOn ?? []).filter((id) => known.has(id)))
  }

  // DFS from toId over existing edges, tracking the path. If we reach fromId,
  // the path (toId → … → fromId) plus fromId at both ends is the cycle.
  const visited = new Set<string>()
  const path: string[] = []

  const dfs = (node: string): boolean => {
    if (node === fromId) return true
    if (visited.has(node)) return false
    visited.add(node)
    path.push(node)
    for (const next of deps.get(node) ?? []) {
      if (dfs(next)) return true
    }
    path.pop()
    return false
  }

  if (dfs(toId)) {
    // path === [toId, …, <node whose dep is fromId>]; append fromId, prefix fromId.
    return [fromId, ...path, fromId]
  }
  return null
}

/**
 * The set of task ids that are "ready" — every id in their `dependsOn` refers to
 * a task with `status === 'done'`, or refers to a task that no longer exists (a
 * dangling blocker doesn't block forever). A task with no `dependsOn` (undefined
 * or `[]`) is always ready.
 */
export function readyTasks(tasks: Task[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ready = new Set<string>()
  for (const t of tasks) {
    const blocked = (t.dependsOn ?? []).some((id) => {
      const dep = byId.get(id)
      return dep != null && dep.status !== 'done'
    })
    if (!blocked) ready.add(t.id)
  }
  return ready
}
