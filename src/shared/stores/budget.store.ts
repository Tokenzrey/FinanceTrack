'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import { getMonthlySummary } from '@/shared/use-cases/budget/GetMonthlySummary.usecase'
import { updateIncome } from '@/shared/use-cases/budget/UpdateIncome.usecase'
import { updatePillarConfig } from '@/shared/use-cases/budget/UpdatePillarConfig.usecase'
import { overrideCategoryBudget } from '@/shared/use-cases/budget/OverrideCategoryBudget.usecase'
import { copyBudgetFromPrevious } from '@/shared/use-cases/budget/CopyBudgetFromPrevious.usecase'
import { closeMonth, reopenMonth } from '@/shared/use-cases/budget/CloseMonth.usecase'
import type { MonthlyBudget, MonthlySummary, PillarConfig } from '@/shared/types/domain'
import { useAuthStore } from './auth.store'

const now = new Date()

interface BudgetStore {
  activePeriod: { year: number; month: number }
  monthlyBudget: MonthlyBudget | null
  summary: MonthlySummary | null
  isLoading: boolean
  error: string | null
  setActivePeriod: (year: number, month: number) => void
  loadSummary: () => Promise<void>
  updateIncome: (income: number) => Promise<void>
  updatePillarConfig: (config: PillarConfig) => Promise<void>
  overrideCategoryBudget: (categoryId: string, value: number | null) => Promise<void>
  copyFromPrevious: () => Promise<void>
  closeActiveMonth: () => Promise<void>
  reopenActiveMonth: () => Promise<void>
}

/** Every mutation reloads the summary so the dashboard never shows stale totals. */
function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  activePeriod: { year: now.getFullYear(), month: now.getMonth() + 1 },
  monthlyBudget: null,
  summary: null,
  isLoading: false,
  error: null,

  setActivePeriod: (year, month) => {
    set({ activePeriod: { year, month } })
    void get().loadSummary()
  },

  loadSummary: async () => {
    const userId = currentUserId()
    if (!userId) return

    const { year, month } = get().activePeriod
    set({ isLoading: true, error: null })
    try {
      const [budget, summary] = await Promise.all([
        repositories.budgets.find(userId, year, month),
        getMonthlySummary(userId, year, month),
      ])
      set({ monthlyBudget: budget, summary })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Gagal memuat anggaran' })
    } finally {
      set({ isLoading: false })
    }
  },

  updateIncome: async (income) => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await updateIncome(userId, year, month, income)
    await get().loadSummary()
  },

  updatePillarConfig: async (config) => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await updatePillarConfig(userId, year, month, config)
    await get().loadSummary()
  },

  overrideCategoryBudget: async (categoryId, value) => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await overrideCategoryBudget(userId, year, month, categoryId, value)
    await get().loadSummary()
  },

  copyFromPrevious: async () => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await copyBudgetFromPrevious(userId, year, month)
    await get().loadSummary()
  },

  closeActiveMonth: async () => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await closeMonth(userId, year, month)
    await get().loadSummary()
  },

  reopenActiveMonth: async () => {
    const userId = currentUserId()
    if (!userId) return
    const { year, month } = get().activePeriod
    await reopenMonth(userId, year, month)
    await get().loadSummary()
  },
}))
