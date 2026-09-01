'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import { createCategory } from '@/shared/use-cases/master-data/CreateCategory.usecase'
import { updateCategory } from '@/shared/use-cases/master-data/UpdateCategory.usecase'
import { deleteCategory } from '@/shared/use-cases/master-data/DeleteCategory.usecase'
import { reorderCategories } from '@/shared/use-cases/master-data/ReorderCategories.usecase'
import type { Category, CategoryItem, Pillar } from '@/shared/types/domain'
import type { CreateCategoryDTO, UpdateCategoryDTO } from '@/shared/types/dto'
import { useAuthStore } from './auth.store'

interface MasterDataStore {
  categories: Category[]
  categoryItems: Record<string, CategoryItem[]>
  isLoading: boolean
  error: string | null
  loadAll: () => Promise<void>
  addCategory: (data: CreateCategoryDTO) => Promise<void>
  updateCategory: (id: string, data: UpdateCategoryDTO) => Promise<void>
  deleteCategory: (id: string, moveToCategoryId?: string) => Promise<void>
  reorder: (pillar: Pillar, orderedIds: string[]) => Promise<void>
  /** Active categories only — forms must never offer a deleted category. */
  activeCategories: () => Category[]
  byPillar: (pillar: Pillar) => Category[]
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export const useMasterDataStore = create<MasterDataStore>((set, get) => ({
  categories: [],
  categoryItems: {},
  isLoading: false,
  error: null,

  loadAll: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ isLoading: true, error: null })
    try {
      const [categories, items] = await Promise.all([
        repositories.categories.findAll(userId),
        repositories.categories.findAllItems(userId),
      ])

      const grouped: Record<string, CategoryItem[]> = {}
      for (const item of items) {
        ;(grouped[item.categoryId] ??= []).push(item)
      }

      set({ categories, categoryItems: grouped })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Gagal memuat kategori' })
    } finally {
      set({ isLoading: false })
    }
  },

  addCategory: async (data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await createCategory(userId, data)
    await get().loadAll()
  },

  updateCategory: async (id, data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await updateCategory(userId, id, data)
    await get().loadAll()
  },

  deleteCategory: async (id, moveToCategoryId) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await deleteCategory(userId, id, moveToCategoryId)
    await get().loadAll()
  },

  reorder: async (pillar, orderedIds) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')

    // Reorder optimistically — dragging must feel instant.
    const position = new Map(orderedIds.map((id, index) => [id, index]))
    set({
      categories: get()
        .categories.map((c) => (position.has(c.id) ? { ...c, order: position.get(c.id)! } : c))
        .sort((a, b) => a.order - b.order),
    })

    await reorderCategories(userId, pillar, orderedIds)
  },

  activeCategories: () => get().categories.filter((c) => c.isActive),

  byPillar: (pillar) =>
    get()
      .categories.filter((c) => c.isActive && c.pillar === pillar)
      .sort((a, b) => a.order - b.order),
}))
