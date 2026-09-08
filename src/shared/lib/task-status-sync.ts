import type { TaskStatus } from '@/shared/types/productivity'
import type { BoardList } from '@/shared/types/board'

/**
 * Returns the TaskStatus that corresponds to a given list id.
 * If listId is null or refers to a deleted list, returns 'todo' (default).
 */
export function statusForList(
  listId: string | null,
  lists: BoardList[]
): TaskStatus {
  if (!listId) return 'todo'
  const list = lists.find((l) => l.id === listId)
  return list ? list.mapsToStatus : 'todo'
}

/**
 * Returns the id of the FIRST list (by ascending order) that maps to the given status.
 * If no list maps to that status, returns null.
 * Does not mutate the input array.
 */
export function listForStatus(
  status: TaskStatus,
  lists: BoardList[]
): string | null {
  // Sort by order ascending (create a copy to avoid mutation).
  const sorted = [...lists].sort((a, b) => a.order - b.order)
  const match = sorted.find((l) => l.mapsToStatus === status)
  return match ? match.id : null
}

/**
 * Reconciles a task's status and listId to keep them consistent with the board's columns.
 * - If listId refers to an existing list, the list wins: status is set to that list's mapsToStatus.
 * - If listId is null or refers to a deleted list, status wins: listId is refilled from the status.
 */
export function reconcile(
  task: { status: TaskStatus; listId: string | null },
  lists: BoardList[]
): { status: TaskStatus; listId: string | null } {
  // Check if listId refers to an existing list.
  const list = task.listId ? lists.find((l) => l.id === task.listId) : null

  if (list) {
    // List exists: list wins, status follows the list's mapsToStatus.
    return {
      status: list.mapsToStatus,
      listId: task.listId,
    }
  }

  // listId is null or refers to a deleted list: status wins, refill listId.
  return {
    status: task.status,
    listId: listForStatus(task.status, lists),
  }
}
