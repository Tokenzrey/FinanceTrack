'use client'

import { useEffect, useMemo, useState } from 'react'
import { daysElapsedInMonth, financialHealthScore, statusFor } from '@/shared/lib/budget-math'
import {
  budgetEfficiencyScores,
  emergencyFundProgress,
  liquidAssets,
  loggingConsistency,
  moodBreakdown,
  paymentMethodBreakdown,
  regretTotal,
  spendingTreemap,
  tagBreakdown,
  topMerchants,
  burnRateAlerts,
} from '@/shared/lib/analytics'
import { debtToIncomeRatio } from '@/shared/lib/debt-payoff'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import type { Asset, Liability, Transaction } from '@/shared/types/domain'
import type { MarketPulse } from '@/app/api/market/route'

export function useAnalyticsData() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const summary = useBudgetStore((s) => s.summary)
  const loadSummary = useBudgetStore((s) => s.loadSummary)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [liabilities, setLiabilities] = useState<Liability[]>([])
  const [market, setMarket] = useState<MarketPulse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    setLoading(true)
    Promise.all([
      loadSummary(),
      repositories.transactions.findByMonth(userId, year, month),
      repositories.netWorth.findAssets(userId),
      repositories.netWorth.findLiabilities(userId),
    ])
      .then(([, txs, assetRows, liabilityRows]) => {
        if (cancelled) return
        setTransactions(txs)
        setAssets(assetRows)
        setLiabilities(liabilityRows)
      })
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [userId, year, month, loadSummary])

  // Market data is optional garnish — a failure must not blank the whole page.
  useEffect(() => {
    let cancelled = false
    fetch('/api/market')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setMarket(data))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const derived = useMemo(() => {
    const categories = summary?.categories ?? []
    const spendCategories = categories.filter((row) => row.category.pillar !== 'income')

    const spending = (summary?.totalUsed ?? 0) - (summary?.totalSaved ?? 0)
    const liquid = liquidAssets(assets)

    const withinBudget = spendCategories.filter(
      (row) => statusFor(row.absorptionRate) !== 'exceeded',
    )
    const adherence =
      spendCategories.length > 0 ? (withinBudget.length / spendCategories.length) * 100 : 100

    const moods = moodBreakdown(transactions)
    const nonRegret = moods
      .filter((bucket) => bucket.mood !== 'regret')
      .reduce((sum, bucket) => sum + bucket.count, 0)
    const totalMoodCount = moods.reduce((sum, bucket) => sum + bucket.count, 0)

    const health = financialHealthScore({
      savingsRate: summary?.savingsRate ?? 0,
      budgetAdherence: adherence,
      emergencyFundProgress: emergencyFundProgress(liquid, spending),
      debtToIncomeRatio: debtToIncomeRatio(liabilities, summary?.totalIncome ?? 0),
      consistency: loggingConsistency(transactions, daysElapsedInMonth(year, month)),
      moodPositiveRate: totalMoodCount > 0 ? (nonRegret / totalMoodCount) * 100 : 100,
    })

    return {
      treemap: spendingTreemap(categories),
      merchants: topMerchants(transactions),
      moods,
      regret: regretTotal(transactions),
      methods: paymentMethodBreakdown(transactions),
      tags: tagBreakdown(transactions),
      alerts: burnRateAlerts(categories),
      efficiency: budgetEfficiencyScores(categories),
      health,
      liquid,
      emergencyProgress: emergencyFundProgress(liquid, spending),
      dti: debtToIncomeRatio(liabilities, summary?.totalIncome ?? 0),
    }
  }, [summary, transactions, assets, liabilities, year, month])

  return { summary, transactions, market, loading, ...derived }
}
