'use client'

import type { LucideIcon } from 'lucide-react'
import { Banknote, PiggyBank, Receipt, Target, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/card'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { TrendIndicator } from '@/shared/components/finance/StatusChip'
import { cn } from '@/shared/lib/utils'
import { formatPercent } from '@/shared/lib/format'
import type { MonthlySummary } from '@/shared/types/domain'

interface KpiCardProps {
  label: string
  value: number
  icon: LucideIcon
  accent: string
  hint?: React.ReactNode
  signed?: boolean
}

function KpiCard({ label, value, icon: Icon, accent, hint, signed }: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', accent)}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        <MoneyDisplay
          value={value}
          animated
          signed={signed}
          className="block font-display text-xl font-bold tracking-tight lg:text-2xl"
        />
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

interface KpiCardsProps {
  summary: MonthlySummary
  /** Spend change vs the same point last month, in percent. */
  vsLastMonth?: number
}

export function KpiCards({ summary, vsLastMonth = 0 }: KpiCardsProps) {
  // Savings contributions are money kept, so "belanja" excludes them.
  const spending = summary.totalUsed - summary.totalSaved
  const cashLeft = summary.totalIncome - summary.totalUsed

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiCard
        label="Pemasukan"
        value={summary.totalIncome}
        icon={Banknote}
        accent="bg-income/15 text-income"
      />
      <KpiCard
        label="Dianggarkan"
        value={summary.totalBudget}
        icon={Target}
        accent="bg-muted text-muted-foreground"
        hint={
          summary.totalIncome > 0
            ? `${formatPercent((summary.totalBudget / summary.totalIncome) * 100)} dari pemasukan`
            : undefined
        }
      />
      <KpiCard
        label="Terpakai"
        value={summary.totalUsed}
        icon={Receipt}
        accent="bg-wants/15 text-wants"
        hint={<TrendIndicator value={vsLastMonth} />}
      />
      <KpiCard
        label="Belanja"
        value={spending}
        icon={Wallet}
        accent="bg-danger/15 text-danger"
        hint="Di luar tabungan"
      />
      <KpiCard
        label="Sisa kas"
        value={cashLeft}
        icon={PiggyBank}
        accent="bg-needs/15 text-needs"
        signed
        hint={`Tabungan ${formatPercent(summary.savingsRate)}`}
      />
    </div>
  )
}
