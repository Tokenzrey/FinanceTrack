import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskStatus } from '@/shared/types/productivity'
import type { BoardList } from '@/shared/types/board'

const updateTask = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    tasks: { update: (...args: unknown[]) => updateTask(...args) },
  },
}))

const { updateTaskStatus } = await import('./UpdateTaskStatus.usecase')

beforeEach(() => {
  updateTask.mockReset().mockResolvedValue(undefined)
})

describe('updateTaskStatus', () => {
  it('rejects an unknown status', async () => {
    await expect(
      updateTaskStatus('u1', 't1', 'archived' as unknown as TaskStatus),
    ).rejects.toThrow(/tidak valid/)
    expect(updateTask).not.toHaveBeenCalled()
  })

  it('forwards a valid status to the repo', async () => {
    await updateTaskStatus('u1', 't1', 'done')
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { status: 'done' })
  })

  it('writes listId alongside status when a column maps to the target status', async () => {
    const ts = Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))
    const lists: BoardList[] = [
      {
        id: 'c3',
        title: 'Selesai',
        order: 3000,
        mapsToStatus: 'done',
        wipLimit: null,
        isCollapsed: false,
        createdAt: ts,
        updatedAt: ts,
      },
    ]
    await updateTaskStatus('u1', 't1', 'done', lists)
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { status: 'done', listId: 'c3' })
  })
})
