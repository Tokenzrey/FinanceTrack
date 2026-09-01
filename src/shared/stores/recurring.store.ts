'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import {
  findDueOccurrences,
  generateDueTransactions,
  skipRecurringOccurrence,
} from '@/shared/use-cases/recurring/GenerateDueTransactions.usecase'
import type { PendingOccurrence } from '@/shared/lib/recurring'
import type { RecurringRule } from '@/shared/types/domain'
import type { CreateRecurringRuleDTO, UpdateRecurringRuleDTO } from '@/shared/types/dto'
import { useAuthStore } from './auth.store'
import { useBudgetStore } from './budget.store'

interface RecurringStore {
  rules: RecurringRule[]
  due: PendingOccurrence[]
  isLoading: boolean
  generating: boolean
  load: () => Promise<void>
  refreshDue: () => Promise<void>
  create: (data: CreateRecurringRuleDTO) => Promise<void>
  update: (id: string, data: UpdateRecurringRuleDTO) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleActive: (rule: RecurringRule) => Promise<void>
  generate: (ruleIds?: string[]) => Promise<{ created: number; skippedClosedMonth: number }>
  skip: (ruleId: string, date: Date) => Promise<void>
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

function activePeriod() {
  return useBudgetStore.getState().activePeriod
}

export const useRecurringStore = create<RecurringStore>((set, get) => ({
  rules: [],
  due: [],
  isLoading: false,
  generating: false,

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ isLoading: true })
    try {
      set({ rules: await repositories.recurring.findAll(userId) })
      await get().refreshDue()
    } catch (error) {
      console.warn('Gagal memuat aturan berulang:', error)
      set({ rules: [], due: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshDue: async () => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = activePeriod()
    set({ due: await findDueOccurrences(userId, year, month) })
  },

  create: async (data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.recurring.create(userId, data)
    await get().load()
  },

  update: async (id, data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.recurring.update(userId, id, data)
    await get().load()
  },

  remove: async (id) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await repositories.recurring.delete(userId, id)
    await get().load()
  },

  toggleActive: async (rule) => {
    await get().update(rule.id, { isActive: !rule.isActive })
  },

  generate: async (ruleIds) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')

    set({ generating: true })
    try {
      const { year, month } = activePeriod()
      const result = await generateDueTransactions(userId, year, month, { ruleIds })
      await get().load()
      // Generated transactions change every dashboard total.
      await useBudgetStore.getState().loadSummary()
      return result
    } finally {
      set({ generating: false })
    }
  },

  skip: async (ruleId, date) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await skipRecurringOccurrence(userId, ruleId, date)
    await get().load()
  },
}))
