'use client'

import { useEffect, useMemo } from 'react'
import { cumulativeCurve } from '@/shared/lib/budget-math'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useTransactionStore } from '@/shared/stores/transaction.store'
import { useRecurringStore } from '@/shared/stores/recurring.store'

/**
 * Wires the dashboard to its stores: loads master data once, then keeps a live
 * Firestore listener on the active month. Switching period re-subscribes.
 */
export function useDashboardData() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const summary = useBudgetStore((s) => s.summary)
  const isBudgetLoading = useBudgetStore((s) => s.isLoading)
  const loadSummary = useBudgetStore((s) => s.loadSummary)

  const categories = useMasterDataStore((s) => s.categories)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const transactions = useTransactionStore((s) => s.transactions)
  const subscribeToMonth = useTransactionStore((s) => s.subscribeToMonth)
  const unsubscribeAll = useTransactionStore((s) => s.unsubscribeAll)

  const loadRecurring = useRecurringStore((s) => s.load)

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void loadSummary()
  }, [userId, loadAll, loadSummary])

  // Recurring rules drive the "due this month" banner; reload when the period moves.
  useEffect(() => {
    if (!userId) return
    void loadRecurring()
  }, [userId, year, month, loadRecurring])

  useEffect(() => {
    if (!userId) return
    subscribeToMonth(year, month)
    return () => unsubscribeAll()
  }, [userId, year, month, subscribeToMonth, unsubscribeAll])

  const curve = useMemo(
    () =>
      summary
        ? cumulativeCurve(transactions, { year, month, totalBudget: summary.totalBudget })
        : [],
    [transactions, year, month, summary],
  )

  const spentToday = useMemo(() => {
    const today = new Date()
    return transactions
      .filter((tx) => tx.type !== 'income')
      .filter((tx) => {
        const date = tx.date.toDate()
        return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate()
        )
      })
      .reduce((sum, tx) => sum + tx.amount, 0)
  }, [transactions])

  return {
    summary,
    categories,
    transactions,
    curve,
    spentToday,
    // Categories arriving late would otherwise flash an "empty" table over real data.
    isLoading: isBudgetLoading && !summary,
    hasCategories: categories.some((c) => c.isActive && c.pillar !== 'income'),
  }
}
