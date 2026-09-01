'use client'

import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
} from 'recharts'
import { ChartLegend, ChartTooltip } from '@/shared/components/charts/ChartContainer'
import { useChartTheme } from '@/shared/components/charts/chart-theme'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { HEALTH_WEIGHTS, type HealthScoreInput } from '@/shared/lib/budget-math'
import { PILLAR_LABELS, type CategorySummary, type Pillar } from '@/shared/types/domain'

/** Treemap of spending, each tile taking its own category colour. */
export function SpendingTreemap({
  data,
}: {
  data: { name: string; size: number; color: string }[]
}) {
  const { ink } = useChartTheme()

  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Belum ada pengeluaran bulan ini.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={data} dataKey="size" content={<TreemapTile surface={ink.surface} />}>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const tile = payload[0].payload as { name: string; size: number; color: string }
            return (
              <ChartTooltip rows={[{ label: tile.name, value: tile.size, color: tile.color }]} />
            )
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  )
}

interface TileProps {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  size?: number
  color?: string
  /** Chart-surface colour, drawn as the 2px gap between adjacent tiles. */
  surface?: string
}

function TreemapTile({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  size,
  color,
  surface = '#FFFFFF',
}: TileProps) {
  const showLabel = width > 64 && height > 34

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color ?? '#94A3B8'}
        stroke={surface}
        strokeWidth={2}
        rx={4}
      />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18} fill="#FFFFFF" fontSize={11} fontWeight={600}>
            {name}
          </text>
          <text x={x + 8} y={y + 32} fill="#FFFFFF" fontSize={9} opacity={0.85}>
            {formatIDR(size ?? 0)}
          </text>
        </>
      )}
    </g>
  )
}

/** Donut of spending per pillar. */
export function PillarDonut({ summaries }: { summaries: CategorySummary[] }) {
  const { colors } = useChartTheme()

  const data = (['needs', 'wants', 'savings'] as const)
    .map((pillar) => ({
      pillar,
      name: PILLAR_LABELS[pillar as Pillar],
      value: summaries
        .filter((row) => row.category.pillar === pillar)
        .reduce((sum, row) => sum + row.used, 0),
      color: colors[pillar],
    }))
    .filter((slice) => slice.value > 0)

  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Belum ada pengeluaran bulan ini.
      </p>
    )
  }

  const total = data.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="flex h-full flex-col gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
          >
            {data.map((slice) => (
              <Cell key={slice.pillar} fill={slice.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const slice = payload[0].payload as (typeof data)[number]
              return (
                <ChartTooltip
                  rows={[{ label: slice.name, value: slice.value, color: slice.color }]}
                />
              )
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <ChartLegend
        items={data.map((slice) => ({
          label: `${slice.name} · ${formatPercent((slice.value / total) * 100)}`,
          color: slice.color,
        }))}
      />
    </div>
  )
}

const HEALTH_LABELS: Record<keyof HealthScoreInput, string> = {
  savingsRate: 'Rasio tabungan',
  budgetAdherence: 'Disiplin anggaran',
  emergencyFundProgress: 'Dana darurat',
  debtToIncomeRatio: 'Beban utang',
  consistency: 'Konsistensi catat',
  moodPositiveRate: 'Kepuasan belanja',
}

/** Radar of the six financial-health components. */
export function HealthRadar({ breakdown }: { breakdown: Record<keyof HealthScoreInput, number> }) {
  const { colors, ink } = useChartTheme()

  const data = (Object.keys(HEALTH_LABELS) as (keyof HealthScoreInput)[]).map((key) => ({
    axis: HEALTH_LABELS[key],
    score: Math.round(breakdown[key]),
    weight: HEALTH_WEIGHTS[key],
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={ink.grid} />
        <PolarAngleAxis dataKey="axis" tick={{ fill: ink.label, fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: ink.label, fontSize: 9 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as (typeof data)[number]
            return (
              <div className="rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
                <p className="text-xs font-medium">{point.axis}</p>
                <p className="tabular text-xs">
                  {point.score}/100 · bobot {formatPercent(point.weight * 100)}
                </p>
              </div>
            )
          }}
        />
        <Radar
          name="Skor"
          dataKey="score"
          stroke={colors.needs}
          fill={colors.needs}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
