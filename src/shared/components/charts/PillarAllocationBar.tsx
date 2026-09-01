'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { PILLAR_LABELS, type Pillar } from '@/shared/types/domain'
import { useChartTheme } from './chart-theme'
import { ChartLegend } from './ChartContainer'

interface PillarAllocationBarProps {
  totalIncome: number
  /** Budgeted amount per spend pillar. */
  allocation: Record<Exclude<Pillar, 'income'>, number>
}

const ORDER = ['needs', 'wants', 'savings'] as const

/**
 * "Ke mana pemasukan pergi" — one horizontal stacked bar.
 *
 * Hand-built rather than a Recharts stack: a single bar needs no axes or scales, and
 * flex gives the 2px surface gaps between segments directly.
 */
export function PillarAllocationBar({ totalIncome, allocation }: PillarAllocationBarProps) {
  const { colors } = useChartTheme()
  const reduceMotion = useReducedMotion()

  const allocated = ORDER.reduce((sum, pillar) => sum + allocation[pillar], 0)
  const unallocated = Math.max(0, totalIncome - allocated)
  const denominator = totalIncome > 0 ? totalIncome : allocated || 1

  const segments = ORDER.map((pillar) => ({
    pillar,
    label: PILLAR_LABELS[pillar],
    value: allocation[pillar],
    percent: (allocation[pillar] / denominator) * 100,
    color: colors[pillar],
  })).filter((segment) => segment.value > 0)

  if (segments.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Belum ada alokasi. Isi pemasukan dan kategori dulu.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex h-12 w-full gap-0.5 overflow-hidden rounded-xl">
        {segments.map((segment) => (
          <motion.div
            key={segment.pillar}
            className="relative flex items-center justify-center"
            style={{ backgroundColor: segment.color }}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${segment.percent}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            title={`${segment.label}: ${formatIDR(segment.value)}`}
          >
            {/* Direct label — the light palette sits under 3:1, so values are never colour-only. */}
            {segment.percent >= 12 && (
              <span className="tabular px-1 text-xs font-semibold text-white drop-shadow-sm">
                {formatPercent(segment.percent)}
              </span>
            )}
          </motion.div>
        ))}
        {unallocated > 0 && (
          <div
            className="flex items-center justify-center bg-muted"
            style={{ width: `${(unallocated / denominator) * 100}%` }}
            title={`Belum dialokasikan: ${formatIDR(unallocated)}`}
          />
        )}
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {segments.map((segment) => (
          <li key={segment.pillar} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: segment.color }}
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{segment.label}</p>
              <p className="tabular text-xs text-muted-foreground">{formatIDR(segment.value)}</p>
            </div>
          </li>
        ))}
      </ul>

      {unallocated > 0 && (
        <ChartLegend
          items={[{ label: `Belum dialokasikan · ${formatIDR(unallocated)}`, color: '#94A3B8' }]}
        />
      )}
    </div>
  )
}
