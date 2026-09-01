'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import {
  analyseWishlistItem,
  getFinancialContext,
  type FinancialContext,
} from '@/shared/use-cases/wishlist/CalculateAffordability.usecase'
import {
  markWishlistAsPurchased,
  type MarkAsPurchasedInput,
} from '@/shared/use-cases/wishlist/MarkAsPurchased.usecase'
import type {
  CreateWishlistDTO,
  UpdateWishlistDTO,
  Wishlist,
  WishlistStatus,
} from '@/shared/types/wishlist.types'
import { useAuthStore } from './auth.store'
import { useBudgetStore } from './budget.store'

interface WishlistStore {
  items: Wishlist[]
  context: FinancialContext | null
  isLoading: boolean
  load: () => Promise<void>
  create: (data: CreateWishlistDTO) => Promise<void>
  update: (id: string, data: UpdateWishlistDTO) => Promise<void>
  /** Adds days to the cooling-off countdown — never shortens it. */
  extendCoolingOff: (id: string, additionalDays: number) => Promise<void>
  setStatus: (id: string, status: WishlistStatus) => Promise<void>
  remove: (id: string) => Promise<void>
  markPurchased: (item: Wishlist, input: MarkAsPurchasedInput) => Promise<void>
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export const useWishlistStore = create<WishlistStore>((set, get) => ({
  items: [],
  context: null,
  isLoading: false,

  /**
   * Loads the list and injects the affordability analysis at runtime.
   * The analysis is never persisted — it depends on today's balances, so a stored copy
   * would be stale the moment a transaction lands.
   */
  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    const { year, month } = useBudgetStore.getState().activePeriod
    set({ isLoading: true })

    try {
      const [items, context] = await Promise.all([
        repositories.wishlist.findAll(userId),
        getFinancialContext(userId, year, month),
      ])

      set({
        context,
        items: items.map((item) => ({
          ...item,
          affordabilityAnalytics: analyseWishlistItem(item, context),
        })),
      })
    } catch (error) {
      console.warn('Gagal memuat wishlist:', error)
      set({ items: [], context: null })
    } finally {
      set({ isLoading: false })
    }
  },

  create: async (data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.wishlist.create(userId, data)
    await get().load()
  },

  update: async (id, data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.wishlist.update(userId, id, data)
    await get().load()
  },

  extendCoolingOff: async (id, additionalDays) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.wishlist.extendCoolingOff(userId, id, additionalDays)
    await get().load()
  },

  setStatus: async (id, status) => {
    await get().update(id, { status })
  },

  remove: async (id) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.wishlist.delete(userId, id)
    await get().load()
  },

  markPurchased: async (item, input) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')

    await markWishlistAsPurchased(userId, item, input)
    await get().load()
    // The new expense changes every dashboard total.
    await useBudgetStore.getState().loadSummary()
  },
}))
