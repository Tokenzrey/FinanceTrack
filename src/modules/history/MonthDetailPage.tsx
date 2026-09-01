'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Download, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { ChartContainer } from '@/shared/components/charts/ChartContainer'
import { PillarAllocationBar } from '@/shared/components/charts/PillarAllocationBar'
import { CumulativeCurveChart } from '@/shared/components/charts/CumulativeCurveChart'
import { KpiCards } from '@/modules/dashboard/components/KpiCards'
import { CategoryTable } from '@/modules/dashboard/components/CategoryTable'
import { cumulativeCurve, type CumulativePoint } from '@/shared/lib/budget-math'
import { downloadCsv, transactionsToCsv } from '@/shared/lib/csv-export'
import { formatMonthLong } from '@/shared/lib/format'
import { getMonthlySummary } from '@/shared/use-cases/budget/GetMonthlySummary.usecase'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Category, MonthlySummary, Transaction } from '@/shared/types/domain'

interface MonthDetailState {
  summary: MonthlySummary
  transactions: Transaction[]
  categories: Category[]
  curve: CumulativePoint[]
  closed: boolean
}

/**
 * A past month rendered read-only.
 *
 * Reuses the dashboard's KPI cards and category table so a historical month is
 * presented exactly as the live one — the only difference is that nothing is editable.
 */
export function MonthDetailPage({ year, month }: { year: number; month: number }) {
  const userId = useAuthStore((s) => s.user?.uid)
  const [state, setState] = useState<MonthDetailState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    setLoading(true)
    Promise.all([
      getMonthlySummary(userId, year, month),
      repositories.transactions.findByMonth(userId, year, month),
      repositories.categories.findAll(userId),
      repositories.budgets.find(userId, year, month),
    ])
      .then(([summary, transactions, categories, budget]) => {
        if (cancelled) return
        setState({
          summary,
          transactions,
          categories,
          curve: cumulativeCurve(transactions, {
            year,
            month,
            totalBudget: summary.totalBudget,
          }),
          closed: Boolean(budget?.closedAt),
        })
      })
      .catch(() => !cancelled && toast.error('Gagal memuat detail bulan'))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [userId, year, month])

  if (loading && !state) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingSkeleton rows={6} />
        </CardContent>
      </Card>
    )
  }

  if (!state || state.transactions.length === 0) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/history">
            <ChevronLeft className="size-4" aria-hidden />
            Riwayat
          </Link>
        </Button>
        <EmptyState
          title={`Tidak ada transaksi di ${formatMonthLong(year, month)}`}
          description="Bulan ini belum punya catatan apa pun."
        />
      </div>
    )
  }

  const allocation = {
    needs: state.summary.pillarSummary.needs.budget,
    wants: state.summary.pillarSummary.wants.budget,
    savings: state.summary.pillarSummary.savings.budget,
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/history">
            <ChevronLeft className="size-4" aria-hidden />
            Riwayat
          </Link>
        </Button>

        <h2 className="font-display text-xl font-bold tracking-tight">
          {formatMonthLong(year, month)}
        </h2>

        {state.closed && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" aria-hidden />
            Ditutup
          </Badge>
        )}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2"
          onClick={() => {
            downloadCsv(
              `fintrack-${year}-${String(month).padStart(2, '0')}.csv`,
              transactionsToCsv(state.transactions, state.categories),
            )
            toast.success('CSV diekspor')
          }}
        >
          <Download className="size-4" aria-hidden />
          Ekspor CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tampilan hanya-baca. Untuk mengubah, buka bulan ini di halaman Transaksi.
      </p>

      <KpiCards summary={state.summary} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <CategoryTable
          categories={state.summary.categories}
          pillarSummary={state.summary.pillarSummary}
        />

        <ChartContainer
          title="Ke mana pemasukan pergi"
          description="Alokasi anggaran per pilar"
          height={160}
        >
          <PillarAllocationBar totalIncome={state.summary.totalIncome} allocation={allocation} />
        </ChartContainer>
      </div>

      <ChartContainer
        title="Kurva kumulatif"
        description="Pengeluaran berjalan dibanding laju rencana"
        height={260}
      >
        <CumulativeCurveChart points={state.curve} />
      </ChartContainer>
    </div>
  )
}
