import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_GAP } from '@/shared/lib/rank'
import type { BoardList } from '@/shared/types/board'

const updateTask = vi.fn()
const batchUpdate = vi.fn()
const batchCommit = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: { tasks: { update: (...a: unknown[]) => updateTask(...a) } },
}))
vi.mock('@/shared/lib/firebase', () => ({ getDb: () => ({}) }))
vi.mock('@/shared/repositories/firestore/paths', () => ({
  colDoc: (_uid: string, _name: string, id: string) => ({ id }),
}))
vi.mock('firebase/firestore', () => ({
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ update: batchUpdate, commit: batchCommit }),
}))

const { moveTask } = await import('./MoveTask.usecase')

const ts = null as never
const LISTS: BoardList[] = [
  { id: 'c1', title: 'Backlog', order: RANK_GAP, mapsToStatus: 'todo', wipLimit: null, isCollapsed: false, createdAt: ts, updatedAt: ts },
  { id: 'c2', title: 'Selesai', order: 2 * RANK_GAP, mapsToStatus: 'done', wipLimit: null, isCollapsed: false, createdAt: ts, updatedAt: ts },
]

beforeEach(() => {
  updateTask.mockReset().mockResolvedValue(undefined)
  batchUpdate.mockReset()
  batchCommit.mockReset().mockResolvedValue(undefined)
})

describe('moveTask', () => {
  it('does a single update write when no destTasks are given', async () => {
    await moveTask('u1', 't1', 'c2', 1500, LISTS)
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { listId: 'c2', order: 1500, status: 'done' })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('does a single update write when the merged column ranks are well-spaced', async () => {
    await moveTask('u1', 't1', 'c1', 1500, LISTS, [
      { id: 'a', order: 1000 },
      { id: 'b', order: 2000 },
    ])
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { listId: 'c1', order: 1500, status: 'todo' })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('rebalances the whole column in one batch when a rank gap has collapsed', async () => {
    await moveTask('u1', 't1', 'c1', 100.00007, LISTS, [
      { id: 'a', order: 100 },
      { id: 'b', order: 100.00005 },
      { id: 'c', order: 100.0001 },
    ])

    expect(updateTask).not.toHaveBeenCalled()
    expect(batchCommit).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledTimes(4)

    // final orders are RANK_GAP-spaced, monotonically increasing
    const orders = batchUpdate.mock.calls.map((c) => (c[1] as { order: number }).order)
    expect(orders).toEqual([RANK_GAP, 2 * RANK_GAP, 3 * RANK_GAP, 4 * RANK_GAP])

    // the moved task's write carries listId + status; the others only re-rank
    const movedCall = batchUpdate.mock.calls.find((c) => (c[0] as { id: string }).id === 't1')!
    expect(movedCall[1]).toMatchObject({ listId: 'c1', status: 'todo' })
  })
})
