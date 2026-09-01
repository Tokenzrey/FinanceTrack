'use client'

import Link from 'next/link'
import { Sliders } from 'lucide-react'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { Card, CardContent } from '@/shared/components/ui/card'
import { ChartContainer } from '@/shared/components/charts/ChartContainer'
import { PillarAllocationBar } from '@/shared/components/charts/PillarAllocationBar'
import { BudgetVsRealityChart } from '@/shared/components/charts/BudgetVsRealityChart'
import { CumulativeCurveChart } from '@/shared/components/charts/CumulativeCurveChart'
import { KpiCards } from './components/KpiCards'
import { CategoryTable } from './components/CategoryTable'
import { DashboardHeader } from './components/DashboardHeader'
import { BudgetAlertBanner, BurnRateWidget, DailyBudgetWidget } from './components/DashboardWidgets'
import { QuickEntryBar, QuickEntryFab } from './components/QuickEntry'
import { InsightsCarousel } from './components/InsightsCarousel'
import { buildInsights } from '@/shared/lib/insights'
import { DueThisMonthBanner } from '@/modules/recurring/RecurringPage'
import { useDashboardData } from './hooks/useDashboardData'
import { Button } from '@/shared/components/ui/button'

export function DashboardPage() {
  const { summary, transactions, curve, spentToday, isLoading, hasCategories } = useDashboardData()

  if (isLoading || !summary) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <LoadingSkeleton rows={1} />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={5} />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hasCategories) {
    return (
      <div className="space-y-6">
        <DashboardHeader />
        <EmptyState
          icon={Sliders}
          title="Belum ada kategori aktif"
          description="Tambahkan kategori pengeluaran untuk mulai menganggarkan dan melihat serapan."
        />
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/master-data">Buka Master Data</Link>
          </Button>
        </div>
      </div>
    )
  }

  const allocation = {
    needs: summary.pillarSummary.needs.budget,
    wants: summary.pillarSummary.wants.budget,
    savings: summary.pillarSummary.savings.budget,
  }

  const vsLastMonth =
    summary.categories.length > 0
      ? summary.categories.reduce((sum, c) => sum + c.vsLastMonth, 0) / summary.categories.length
      : 0

  return (
    <div className="space-y-5">
      <DashboardHeader />

      <BudgetAlertBanner summary={summary} />

      <DueThisMonthBanner />

      {/* Zone A — headline numbers */}
      <KpiCards summary={summary} vsLastMonth={vsLastMonth} />

      <InsightsCarousel insights={buildInsights(summary, transactions)} />

      {/* Zone B — table left, charts right */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CategoryTable categories={summary.categories} pillarSummary={summary.pillarSummary} />
        </div>

        <div className="space-y-4">
          <DailyBudgetWidget summary={summary} spentToday={spentToday} />
          <BurnRateWidget summary={summary} />

          <ChartContainer
            title="Ke mana pemasukan pergi"
            description="Alokasi anggaran per pilar"
            height={160}
          >
            <PillarAllocationBar totalIncome={summary.totalIncome} allocation={allocation} />
          </ChartContainer>

          <ChartContainer
            title="Anggaran vs kenyataan"
            description="Rencana dibanding pemakaian"
            height={220}
          >
            <BudgetVsRealityChart
              data={{
                needs: summary.pillarSummary.needs,
                wants: summary.pillarSummary.wants,
                savings: summary.pillarSummary.savings,
              }}
            />
          </ChartContainer>
        </div>
      </div>

      {/* Zone C — trend and quick entry */}
      <ChartContainer
        title="Kurva kumulatif"
        description="Pengeluaran berjalan dibanding laju rencana"
        height={260}
      >
        <CumulativeCurveChart points={curve} />
      </ChartContainer>

      <QuickEntryBar />
      <QuickEntryFab />
    </div>
  )
}
