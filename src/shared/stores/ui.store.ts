'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppNotification } from '@/shared/types/domain'

interface UIStore {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  activeModal: string | null
  notifications: AppNotification[]
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openModal: (id: string) => void
  closeModal: () => void
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  dismissNotification: (id: string) => void
  markAllRead: () => void
}

/**
 * Theme lives in `next-themes`, not here — one owner avoids the two disagreeing
 * and flashing the wrong palette on load. Only sidebar state is persisted.
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      activeModal: null,
      notifications: [],

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),

      openModal: (id) => set({ activeModal: id }),
      closeModal: () => set({ activeModal: null }),

      addNotification: (n) =>
        set({
          notifications: [
            {
              ...n,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              read: false,
            },
            ...get().notifications,
          ].slice(0, 50),
        }),

      dismissNotification: (id) =>
        set({ notifications: get().notifications.filter((n) => n.id !== id) }),

      markAllRead: () =>
        set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
    }),
    {
      name: 'fintrack-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
