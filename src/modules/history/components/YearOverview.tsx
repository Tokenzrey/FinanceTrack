'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Award, Flame, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/shared/components/charts/ChartContainer'
import { useChartTheme } from '@/shared/components/charts/chart-theme'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { formatIDRCompact, formatMonthShort, formatPercent } from '@/shared/lib/format'
import { savingsRateOf, type YearSummary } from '@/shared/lib/year-summary'

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <MoneyDisplay value={value} compact className="block font-display text-xl font-bold" />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/** Income vs spending vs savings, twelve months side by side. */
function YearlyTrendChart({ summary }: { summary: YearSummary }) {
  const { flow, ink } = useChartTheme()

  const data = summary.months.map((month) => ({
    label: formatMonthShort(month.year, month.month),
    income: month.income,
    spending: month.spending,
    saved: month.saved,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2}>
        <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: ink.grid }}
          tick={{ fill: ink.label, fontSize: 10 }}
          interval={0}
        />
        <YAxis
          tickFormatter={(value: number) => formatIDRCompact(value)}
          tickLine={false}
          axisLine={false}
          tick={{ fill: ink.label, fontSize: 11 }}
          width={64}
        />
        <Tooltip
          cursor={{ fill: ink.grid, fillOpacity: 0.35 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as (typeof data)[number]
            return (
              <ChartTooltip
                title={String(label)}
                rows={[
                  { label: 'Pemasukan', value: row.income, color: flow.income },
                  { label: 'Belanja', value: row.spending, color: flow.spending },
                  { label: 'Tabungan', value: row.saved, color: flow.saved },
                ]}
              />
            )
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
        <Bar dataKey="income" name="Pemasukan" fill={flow.income} radius={[4, 4, 0, 0]} />
        <Bar dataKey="spending" name="Belanja" fill={flow.spending} radius={[4, 4, 0, 0]} />
        <Bar dataKey="saved" name="Tabungan" fill={flow.saved} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function YearOverview({ summary }: { summary: YearSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pemasukan setahun" value={summary.totalIncome} />
        <StatCard label="Belanja setahun" value={summary.totalSpending} />
        <StatCard
          label="Tabungan setahun"
          value={summary.totalSaved}
          hint={`Rasio ${formatPercent(summary.savingsRate)}`}
        />
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">Streak pencatatan</p>
            <p className="flex items-center gap-1.5 font-display text-xl font-bold">
              <Flame className="size-5 text-warning" aria-hidden />
              {summary.loggingStreak} bulan
            </p>
            <p className="text-xs text-muted-foreground">Berturut-turut ada transaksi</p>
          </CardContent>
        </Card>
      </div>

      {(summary.bestMonth || summary.worstMonth) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.bestMonth && (
            <Card className="border-safe/40 bg-safe/5">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-safe/15 text-safe">
                  <Award className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Bulan terbaik:{' '}
                    {formatMonthShort(summary.bestMonth.year, summary.bestMonth.month)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Menabung {formatPercent(savingsRateOf(summary.bestMonth))} dari pemasukan
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.worstMonth && (
            <Card className="border-exceeded/40 bg-exceeded/5">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-exceeded/15 text-exceeded">
                  <TrendingDown className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Bulan terberat:{' '}
                    {formatMonthShort(summary.worstMonth.year, summary.worstMonth.month)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Menabung {formatPercent(savingsRateOf(summary.worstMonth))} dari pemasukan
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ChartContainer
        title="Tren 12 bulan"
        description="Pemasukan, belanja, dan tabungan per bulan"
        height={280}
      >
        <YearlyTrendChart summary={summary} />
      </ChartContainer>
    </div>
  )
}
