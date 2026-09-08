import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Stub the stores so the page renders without Firebase.
const setQuery = vi.fn()
const stamp = { toMillis: () => 1, toDate: () => new Date(1) }
const notesState = {
  notes: [
    {
      id: 'n1',
      title: 'Belanja mingguan',
      content: 'beli telur dan susu',
      tags: ['rumah'],
      source: 'web',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
  isLoading: false,
  query: '',
  subscribe: () => () => {},
  setQuery,
  addNote: vi.fn(),
  updateNote: vi.fn(),
  removeNote: vi.fn(),
}

vi.mock('@/shared/stores/notes.store', () => ({
  useNotesStore: Object.assign(
    (selector: (s: typeof notesState) => unknown) => selector(notesState),
    { getState: () => notesState },
  ),
}))

vi.mock('@/shared/stores/auth.store', () => {
  const authState = { profile: { timezone: 'Asia/Jakarta' }, user: { uid: 'u1' } }
  return {
    useAuthStore: Object.assign(
      (selector: (s: typeof authState) => unknown) => selector(authState),
      { getState: () => authState },
    ),
  }
})

import { NotesPage } from './NotesPage'

describe('NotesPage search', () => {
  it('pushes the debounced keyword typed in the search box into the store', async () => {
    render(<NotesPage />)

    const input = screen.getByPlaceholderText(/cari catatan/i)
    fireEvent.change(input, { target: { value: 'telur' } })

    await waitFor(() => expect(setQuery).toHaveBeenCalledWith('telur'))
  })
})
