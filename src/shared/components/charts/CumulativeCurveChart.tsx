'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatIDRCompact } from '@/shared/lib/format'
import type { CumulativePoint } from '@/shared/lib/budget-math'
import { useChartTheme } from './chart-theme'
import { ChartLegend, ChartTooltip } from './ChartContainer'

interface CumulativeCurveChartProps {
  points: CumulativePoint[]
}

/**
 * Cumulative spend vs the straight-line plan.
 *
 * Two series on one axis: actual is solid, plan is dashed and recessive. The dash
 * carries the identity as well as the colour, so the pair survives a greyscale print.
 */
export function CumulativeCurveChart({ points }: CumulativeCurveChartProps) {
  const { colors, ink } = useChartTheme()

  const hasActual = points.some((p) => p.actual !== null && p.actual > 0)
  if (points.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Belum ada data bulan ini.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
            tick={{ fill: ink.label, fontSize: 11 }}
            // Every day would collide; label roughly weekly instead.
            interval={4}
          />
          <YAxis
            tickFormatter={(value: number) => formatIDRCompact(value)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: ink.label, fontSize: 11 }}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: ink.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as CumulativePoint
              return (
                <ChartTooltip
                  title={`Tanggal ${label}`}
                  rows={[
                    ...(point.actual !== null
                      ? [{ label: 'Aktual', value: point.actual, color: colors.wants }]
                      : []),
                    { label: 'Rencana', value: point.plan, color: ink.axis },
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="plan"
            name="Rencana"
            stroke={ink.axis}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Aktual"
            stroke={colors.wants}
            strokeWidth={2}
            dot={false}
            // Leaves a gap after today instead of dropping to zero.
            connectNulls={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: ink.surface }}
          />
        </LineChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Aktual', color: colors.wants },
          { label: 'Rencana (garis putus)', color: ink.axis },
        ]}
      />

      {!hasActual && (
        <p className="text-xs text-muted-foreground">
          Belum ada pengeluaran tercatat — garis aktual muncul setelah transaksi pertama.
        </p>
      )}
    </div>
  )
}
