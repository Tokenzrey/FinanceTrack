'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import { addTransaction } from '@/shared/use-cases/transactions/AddTransaction.usecase'
import { editTransaction } from '@/shared/use-cases/transactions/EditTransaction.usecase'
import {
  bulkDeleteTransactions,
  deleteTransaction,
} from '@/shared/use-cases/transactions/DeleteTransaction.usecase'
import type { Transaction } from '@/shared/types/domain'
import type { CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types/dto'
import { useAuthStore } from './auth.store'
import { useBudgetStore } from './budget.store'

interface TransactionStore {
  transactions: Transaction[]
  isLoading: boolean
  unsubscribe: (() => void) | null
  subscribeToMonth: (year: number, month: number) => void
  unsubscribeAll: () => void
  /** Returns the created transaction so callers can attach a receipt keyed by its id. */
  add: (data: CreateTransactionDTO) => Promise<Transaction>
  update: (id: string, data: UpdateTransactionDTO) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkRemove: (ids: string[]) => Promise<void>
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  isLoading: false,
  unsubscribe: null,

  /**
   * Real-time listener. Firestore pushes the local write back immediately from cache,
   * so the list updates before the server round trip — no manual optimistic state needed.
   */
  subscribeToMonth: (year, month) => {
    const userId = currentUserId()
    if (!userId) return

    get().unsubscribe?.()
    set({ isLoading: true })

    const unsubscribe = repositories.transactions.subscribeToMonth(userId, year, month, (txs) => {
      set({ transactions: txs, isLoading: false })
      // Totals depend on transactions; keep the dashboard summary in step.
      void useBudgetStore.getState().loadSummary()
    })

    set({ unsubscribe })
  },

  unsubscribeAll: () => {
    get().unsubscribe?.()
    set({ unsubscribe: null })
  },

  add: async (data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    return addTransaction(userId, data)
  },

  update: async (id, data) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await editTransaction(userId, id, data)
  },

  remove: async (id) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await deleteTransaction(userId, id)
  },

  bulkRemove: async (ids) => {
    const userId = currentUserId()
    if (!userId) throw new Error('Belum masuk')
    await bulkDeleteTransactions(userId, ids)
  },
}))
