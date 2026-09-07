import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskStatus } from '@/shared/types/productivity'

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
})
