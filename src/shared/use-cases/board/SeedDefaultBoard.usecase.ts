import { RANK_GAP } from '@/shared/lib/rank'
import { repositories } from '@/shared/repositories'

/** Column order matches the todo→doing→done flow; titles are user-facing (Bahasa Indonesia). */
const DEFAULT_LISTS = [
  { title: 'Backlog', mapsToStatus: 'todo' as const, order: RANK_GAP },
  { title: 'Dikerjakan', mapsToStatus: 'doing' as const, order: 2 * RANK_GAP },
  { title: 'Selesai', mapsToStatus: 'done' as const, order: 3 * RANK_GAP },
]

/**
 * Creates the three default board columns for a user who has none yet.
 * Idempotent: a second call finds existing lists and returns without writing.
 * Called once on `BoardView` mount (Task 8).
 */
export async function seedDefaultBoard(userId: string): Promise<void> {
  const existing = await repositories.boardLists.list(userId)
  if (existing.length > 0) return

  for (const list of DEFAULT_LISTS) {
    await repositories.boardLists.create(userId, {
      ...list,
      wipLimit: null,
      isCollapsed: false,
    })
  }
}
