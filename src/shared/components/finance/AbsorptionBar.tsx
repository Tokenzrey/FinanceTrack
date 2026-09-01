'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import { formatPercent } from '@/shared/lib/format'
import { statusFor } from '@/shared/lib/budget-math'
import type { BudgetStatus } from '@/shared/types/domain'

export const STATUS_FILL: Record<BudgetStatus, string> = {
  safe: 'bg-gradient-to-r from-safe/80 to-safe',
  warning: 'bg-gradient-to-r from-warning/80 to-warning',
  danger: 'bg-gradient-to-r from-danger/80 to-danger',
  exceeded: 'bg-gradient-to-r from-exceeded/80 to-exceeded',
}

export const STATUS_TEXT: Record<BudgetStatus, string> = {
  safe: 'text-safe',
  warning: 'text-warning',
  danger: 'text-danger',
  exceeded: 'text-exceeded',
}

interface AbsorptionBarProps {
  /** Percent of budget already used. Can exceed 100. */
  rate: number
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function AbsorptionBar({
  rate,
  showLabel = true,
  size = 'md',
  className,
}: AbsorptionBarProps) {
  const reduceMotion = useReducedMotion()
  const status = statusFor(rate)
  // The track is capped at 100%; the label carries the real number when it overflows.
  const width = Math.min(100, Math.max(0, rate))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-muted',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
        role="progressbar"
        aria-valuenow={Math.round(rate)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Serapan anggaran"
      >
        <motion.div
          className={cn('h-full rounded-full', STATUS_FILL[status])}
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
      {showLabel && (
        <span
          className={cn(
            'tabular w-12 shrink-0 text-right text-xs font-medium',
            STATUS_TEXT[status],
          )}
        >
          {formatPercent(rate)}
        </span>
      )}
    </div>
  )
}
