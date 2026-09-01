'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatIDRCompact } from '@/shared/lib/format'
import { PILLAR_LABELS, type Pillar } from '@/shared/types/domain'
import { useChartTheme } from './chart-theme'
import { ChartLegend, ChartTooltip } from './ChartContainer'

type SpendPillar = Exclude<Pillar, 'income'>

interface BudgetVsRealityChartProps {
  data: Record<SpendPillar, { budget: number; used: number }>
}

const ORDER: SpendPillar[] = ['needs', 'wants', 'savings']

/**
 * Grouped bars per pillar: planned vs actual.
 *
 * Series identity is carried by fill vs outline, not by hue — hue stays reserved for the
 * pillar, so the same colour means the same thing here as everywhere else on the dashboard.
 */
export function BudgetVsRealityChart({ data }: BudgetVsRealityChartProps) {
  const { colors, ink } = useChartTheme()

  const rows = ORDER.map((pillar) => ({
    pillar,
    label: PILLAR_LABELS[pillar],
    budget: data[pillar].budget,
    used: data[pillar].used,
    color: colors[pillar],
  }))

  const hasData = rows.some((row) => row.budget > 0 || row.used > 0)
  if (!hasData) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Belum ada anggaran untuk dibandingkan.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2}>
          <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
            tick={{ fill: ink.label, fontSize: 11 }}
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
              const row = payload[0].payload as (typeof rows)[number]
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    { label: 'Anggaran', value: row.budget, color: ink.axis },
                    { label: 'Terpakai', value: row.used, color: row.color },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="budget" name="Anggaran" radius={[4, 4, 0, 0]} fillOpacity={0.18}>
            {rows.map((row) => (
              <Cell
                key={row.pillar}
                fill={row.color}
                stroke={row.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ))}
          </Bar>
          <Bar dataKey="used" name="Terpakai" radius={[4, 4, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.pillar} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Anggaran (garis putus)', color: ink.axis },
          { label: 'Terpakai (isi penuh)', color: colors.needs },
        ]}
      />
    </div>
  )
}
