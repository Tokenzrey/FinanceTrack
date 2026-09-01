'use client'

import { AlertTriangle, Flame, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/card'
import { DailyAllowance } from '@/shared/components/finance/DailyAllowance'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { cn } from '@/shared/lib/utils'
import { formatIDR } from '@/shared/lib/format'
import { daysInMonth, daysLeftInMonth } from '@/shared/lib/budget-math'
import type { MonthlySummary } from '@/shared/types/domain'

/** "Jatah harian: Rp X/hari — sisa N hari", plus how today compares to that allowance. */
export function DailyBudgetWidget({
  summary,
  spentToday,
}: {
  summary: MonthlySummary
  spentToday: number
}) {
  const daysLeft = daysLeftInMonth(summary.year, summary.month)
  const remaining = summary.totalBudget - summary.totalUsed
  const perDay = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0
  const saved = perDay - spentToday

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <DailyAllowance perDay={perDay} daysLeft={daysLeft} />

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">Hari ini</span>
          <MoneyDisplay value={spentToday} className="text-sm font-semibold" />
        </div>

        {daysLeft > 0 && (
          <p
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              saved >= 0 ? 'text-safe' : 'text-exceeded',
            )}
          >
            <TrendingDown className={cn('size-3.5', saved < 0 && 'rotate-180')} aria-hidden />
            {saved >= 0
              ? `Hemat ${formatIDR(saved)} dari jatah hari ini`
              : `Lewat ${formatIDR(Math.abs(saved))} dari jatah hari ini`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Burn-rate projection. Only shown when the current pace overshoots the budget —
 * a warning that is always on screen stops being a warning.
 */
export function BurnRateWidget({ summary }: { summary: MonthlySummary }) {
  const total = daysInMonth(summary.year, summary.month)
  const spendCategories = summary.categories.filter((c) => c.category.pillar !== 'income')
  const projected = spendCategories.reduce((sum, c) => sum + c.projectedMonthEnd, 0)

  if (summary.totalBudget === 0 || projected <= summary.totalBudget) return null

  const dailyRate = spendCategories.reduce((sum, c) => sum + c.dailyBurnRate, 0)
  const daysUntilEmpty =
    dailyRate > 0 ? Math.floor((summary.totalBudget - summary.totalUsed) / dailyRate) : total

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <Flame className="size-4" aria-hidden />
        </span>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Laju pengeluaran di atas rencana</p>
          <p className="text-xs text-muted-foreground">
            Dengan laju sekarang, bulan ini berakhir di{' '}
            <strong className="text-foreground">{formatIDR(projected)}</strong> — melebihi anggaran{' '}
            {formatIDR(summary.totalBudget)}.
            {daysUntilEmpty >= 0 && daysUntilEmpty < total
              ? ` Anggaran habis dalam ~${daysUntilEmpty} hari.`
              : ''}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** Top banner listing categories already over budget. */
export function BudgetAlertBanner({ summary }: { summary: MonthlySummary }) {
  const exceeded = summary.categories.filter((c) => c.status === 'exceeded')
  if (exceeded.length === 0) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-exceeded/40 bg-exceeded/5 p-4"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-exceeded/15 text-exceeded">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{exceeded.length} kategori melewati anggaran</p>
        <p className="text-xs text-muted-foreground">
          {exceeded
            .map((c) => `${c.category.name} (${formatIDR(Math.abs(c.remaining))} lebih)`)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}
