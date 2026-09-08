import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '@/shared/types/productivity'

const updateTask = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: { tasks: { update: (...a: unknown[]) => updateTask(...a) } },
}))

const { setTaskLabels } = await import('./SetTaskLabels.usecase')

const TASK = { id: 't1' } as Task

beforeEach(() => {
  updateTask.mockReset().mockResolvedValue(undefined)
})

describe('setTaskLabels', () => {
  it('caps at 6 labels (§2.1)', async () => {
    await setTaskLabels('u1', TASK, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', {
      labelIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
  })

  it('passes a below-cap list through unchanged', async () => {
    await setTaskLabels('u1', TASK, ['a', 'b', 'c'])
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { labelIds: ['a', 'b', 'c'] })
  })
})
