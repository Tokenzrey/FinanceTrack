import { beforeEach, describe, expect, it, vi } from 'vitest'

const createTask_ = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    tasks: { create: (...args: unknown[]) => createTask_(...args) },
  },
}))

const { createTask } = await import('./CreateTask.usecase')

beforeEach(() => {
  createTask_.mockReset().mockResolvedValue({ id: 'task-1' })
})

describe('createTask', () => {
  it('rejects a whitespace-only title', async () => {
    await expect(createTask('u1', { title: '   ', source: 'web' })).rejects.toThrow(/wajib diisi/)
    expect(createTask_).not.toHaveBeenCalled()
  })

  it('trims the title and delegates to the repo', async () => {
    await createTask('u1', { title: '  Beli susu  ', source: 'web' })
    expect(createTask_).toHaveBeenCalledWith('u1', { title: 'Beli susu', source: 'web' })
  })
})
