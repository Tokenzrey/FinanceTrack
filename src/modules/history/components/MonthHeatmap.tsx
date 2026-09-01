'use client'

import Link from 'next/link'
import { cn } from '@/shared/lib/utils'
import { formatIDRCompact, formatMonthShort, formatPercent } from '@/shared/lib/format'
import { statusFor } from '@/shared/lib/budget-math'
import type { MonthHistory } from '@/shared/lib/year-summary'
import type { BudgetStatus } from '@/shared/types/domain'

const CELL_CLASS: Record<BudgetStatus, string> = {
  safe: 'bg-safe/15 border-safe/40 text-safe',
  warning: 'bg-warning/15 border-warning/40 text-warning',
  danger: 'bg-danger/15 border-danger/40 text-danger',
  exceeded: 'bg-exceeded/15 border-exceeded/40 text-exceeded',
}

const STATUS_LABEL: Record<BudgetStatus, string> = {
  safe: 'Aman',
  warning: 'Waspada',
  danger: 'Kritis',
  exceeded: 'Terlampaui',
}

/**
 * Twelve cells, coloured by absorption.
 *
 * These are the app's reserved status colours, and every cell prints its own
 * percentage — the colour is a second signal, never the only one.
 */
export function MonthHeatmap({ months }: { months: MonthHistory[] }) {
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {months.map((month) => {
          const status = statusFor(month.absorptionRate)
          const label = formatMonthShort(month.year, month.month)

          if (!month.hasData) {
            return (
              <li
                key={month.month}
                className="rounded-xl border border-dashed p-2.5 text-center text-muted-foreground"
              >
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[10px]">—</p>
              </li>
            )
          }

          return (
            <li key={month.month}>
              <Link
                href={`/history/${month.year}/${month.month}`}
                className={cn(
                  'block rounded-xl border p-2.5 text-center transition-transform hover:scale-[1.03]',
                  CELL_CLASS[status],
                )}
                title={`${label}: ${formatPercent(month.absorptionRate)} terpakai — ${STATUS_LABEL[status]}`}
              >
                <p className="text-xs font-medium">{label}</p>
                <p className="tabular text-sm font-bold">{formatPercent(month.absorptionRate)}</p>
                <p className="tabular text-[10px] opacity-80">
                  {formatIDRCompact(month.spending + month.saved)}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(CELL_CLASS) as BudgetStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2.5 rounded-[3px] border', CELL_CLASS[status])} aria-hidden />
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ul>
    </div>
  )
}
