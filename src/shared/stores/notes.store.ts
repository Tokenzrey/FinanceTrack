'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import { createNote } from '@/shared/use-cases/planner/CreateNote.usecase'
import type { CreateNoteDTO, Note } from '@/shared/types/productivity'
import { useAuthStore } from './auth.store'

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

type NotePatch = { title?: string; content?: string; tags?: string[] }

interface NotesStore {
  notes: Note[]
  isLoading: boolean
  /** Raw search keyword. Filtering itself is client-side, done in the component. */
  query: string
  /** Wires `repositories.notes.watch`; returns the unsubscribe. No-op when signed out. */
  subscribe: () => () => void
  setQuery: (q: string) => void
  /** Returns the created note so the caller can react to it. */
  addNote: (dto: CreateNoteDTO) => Promise<Note>
  updateNote: (id: string, patch: NotePatch) => Promise<void>
  removeNote: (id: string) => Promise<void>
}

/** Writes never re-fetch — `watch` pushes the new list. */
export const useNotesStore = create<NotesStore>((set) => ({
  notes: [],
  isLoading: false,
  query: '',

  subscribe: () => {
    const uid = currentUserId()
    if (!uid) return () => {}
    set({ isLoading: true })
    return repositories.notes.watch(uid, (notes) => set({ notes, isLoading: false }))
  },

  setQuery: (q) => set({ query: q }),

  addNote: async (dto) => {
    const uid = currentUserId()
    if (!uid) throw new Error('Belum masuk')
    return createNote(uid, dto)
  },

  updateNote: async (id, patch) => {
    const uid = currentUserId()
    if (!uid) return
    await repositories.notes.update(uid, id, patch)
  },

  removeNote: async (id) => {
    const uid = currentUserId()
    if (!uid) return
    await repositories.notes.remove(uid, id)
  },
}))
