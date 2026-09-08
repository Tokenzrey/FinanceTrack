import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_GAP } from '@/shared/lib/rank'

const listFn = vi.fn()
const createFn = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    boardLists: {
      list: (...a: unknown[]) => listFn(...a),
      create: (...a: unknown[]) => createFn(...a),
    },
  },
}))

const { seedDefaultBoard } = await import('./SeedDefaultBoard.usecase')

beforeEach(() => {
  listFn.mockReset()
  createFn.mockReset().mockResolvedValue(undefined)
})

describe('seedDefaultBoard', () => {
  it('creates the three default columns when none exist', async () => {
    listFn.mockResolvedValue([])

    await seedDefaultBoard('u1')

    expect(createFn).toHaveBeenCalledTimes(3)
    expect(createFn).toHaveBeenNthCalledWith(1, 'u1', {
      title: 'Backlog',
      mapsToStatus: 'todo',
      order: RANK_GAP,
      wipLimit: null,
      isCollapsed: false,
    })
    expect(createFn).toHaveBeenNthCalledWith(2, 'u1', {
      title: 'Dikerjakan',
      mapsToStatus: 'doing',
      order: 2 * RANK_GAP,
      wipLimit: null,
      isCollapsed: false,
    })
    expect(createFn).toHaveBeenNthCalledWith(3, 'u1', {
      title: 'Selesai',
      mapsToStatus: 'done',
      order: 3 * RANK_GAP,
      wipLimit: null,
      isCollapsed: false,
    })
  })

  it('is idempotent — does nothing when lists already exist', async () => {
    listFn.mockResolvedValue([{ id: 'l1' }])

    await seedDefaultBoard('u1')

    expect(createFn).not.toHaveBeenCalled()
  })
})
