import { beforeEach, describe, expect, it, vi } from 'vitest'

const createNote_ = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    notes: { create: (...args: unknown[]) => createNote_(...args) },
  },
}))

const { createNote } = await import('./CreateNote.usecase')

beforeEach(() => {
  createNote_.mockReset().mockResolvedValue({ id: 'note-1' })
})

describe('createNote', () => {
  it('rejects blank content', async () => {
    await expect(createNote('u1', { content: '   ', source: 'web' })).rejects.toThrow(/wajib diisi/)
    expect(createNote_).not.toHaveBeenCalled()
  })

  it('derives the title from the first line when none is given', async () => {
    await createNote('u1', { content: 'Rapat tim jam 3\nAgenda: rilis', source: 'web' })
    expect(createNote_).toHaveBeenCalledWith('u1', {
      content: 'Rapat tim jam 3\nAgenda: rilis',
      source: 'web',
      title: 'Rapat tim jam 3',
    })
  })
})
