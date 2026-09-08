import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_GAP } from '@/shared/lib/rank'
import type { Task } from '@/shared/types/productivity'

const updateTask = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: { tasks: { update: (...a: unknown[]) => updateTask(...a) } },
}))

const { reorderChecklistItem } = await import('./ReorderChecklistItem.usecase')

const task = (checklist: Task['checklist']): Task =>
  ({ id: 't1', checklist }) as unknown as Task

beforeEach(() => {
  updateTask.mockReset().mockResolvedValue(undefined)
})

describe('reorderChecklistItem', () => {
  it('rewrites only the moved item when neighbour gaps are healthy', async () => {
    await reorderChecklistItem('u1', task([
      { id: 'a', title: 'A', done: false, order: 1000 },
      { id: 'b', title: 'B', done: false, order: 2000 },
      { id: 'c', title: 'C', done: false, order: 3000 },
    ]), 0, 1)

    const [, , patch] = updateTask.mock.calls[0]
    const orders = (patch.checklist as { id: string; order: number }[])
    expect(orders.find((c) => c.id === 'a')!.order).toBe(2500) // midpoint of 2000..3000
    expect(orders.find((c) => c.id === 'b')!.order).toBe(2000) // untouched
    expect(orders.find((c) => c.id === 'c')!.order).toBe(3000) // untouched
  })

  it('respaces every item with RANK_GAP spacing when a gap has collapsed', async () => {
    await reorderChecklistItem('u1', task([
      { id: 'a', title: 'A', done: false, order: 100 },
      { id: 'b', title: 'B', done: false, order: 100.00005 },
      { id: 'c', title: 'C', done: false, order: 100.0001 },
    ]), 2, 0)

    expect(updateTask).toHaveBeenCalledTimes(1)
    const [, , patch] = updateTask.mock.calls[0]
    const list = patch.checklist as { order: number }[]
    expect(list.map((c) => c.order)).toEqual([RANK_GAP, 2 * RANK_GAP, 3 * RANK_GAP])
  })
})
