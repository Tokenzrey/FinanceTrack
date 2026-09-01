import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatPercent } from '@/shared/lib/format'
import type { BudgetStatus } from '@/shared/types/domain'

const STATUS_LABEL: Record<BudgetStatus, string> = {
  safe: 'Aman',
  warning: 'Waspada',
  danger: 'Kritis',
  exceeded: 'Terlampaui',
}

const STATUS_CHIP: Record<BudgetStatus, string> = {
  safe: 'bg-safe/15 text-safe border-safe/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  exceeded: 'bg-exceeded/15 text-exceeded border-exceeded/30',
}

export function StatusChip({ status, className }: { status: BudgetStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_CHIP[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

interface TrendIndicatorProps {
  /** Percent change vs the comparison period. */
  value: number
  /** For spending, up is bad. For income and savings, up is good. */
  invert?: boolean
  className?: string
}

export function TrendIndicator({ value, invert = false, className }: TrendIndicatorProps) {
  const stable = Math.abs(value) < 5
  const rising = value > 0
  const good = invert ? rising : !rising

  const Icon = stable ? Minus : rising ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5 text-xs font-medium',
        stable ? 'text-muted-foreground' : good ? 'text-safe' : 'text-exceeded',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {stable ? 'stabil' : formatPercent(Math.abs(value))}
    </span>
  )
}

export function PercentBadge({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      {formatPercent(value)}
    </span>
  )
}
