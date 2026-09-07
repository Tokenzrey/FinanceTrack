import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '@/shared/types/productivity'

const listNotes = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    notes: { list: (...args: unknown[]) => listNotes(...args) },
  },
}))

const { searchNotes } = await import('./SearchNotes.usecase')

const notes = [
  { id: 'n1', title: 'Belanja', content: 'susu telur', tags: ['rumah'], source: 'web' },
  { id: 'n2', title: 'Kerjaan', content: 'deploy jumat', tags: ['kantor'], source: 'web' },
] as unknown as Note[]

beforeEach(() => {
  listNotes.mockReset().mockResolvedValue(notes)
})

describe('searchNotes', () => {
  it('returns every note when the keyword is blank', async () => {
    expect(await searchNotes('u1', '   ')).toEqual(notes)
  })

  it('matches title, content or tags case-insensitively', async () => {
    expect(await searchNotes('u1', 'DEPLOY')).toEqual([notes[1]])
    expect(await searchNotes('u1', 'rumah')).toEqual([notes[0]])
    expect(await searchNotes('u1', 'nope')).toEqual([])
  })
})
