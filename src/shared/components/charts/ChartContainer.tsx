'use client'

import { cn } from '@/shared/lib/utils'
import { formatIDR } from '@/shared/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'

interface ChartContainerProps {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Rendered under the plot — the legend, or a note. */
  footer?: React.ReactNode
  height?: number
  children: React.ReactNode
  className?: string
}

export function ChartContainer({
  title,
  description,
  actions,
  footer,
  height = 260,
  children,
  className,
}: ChartContainerProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="font-display text-base">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-3">
        <div style={{ height }}>{children}</div>
        {footer}
      </CardContent>
    </Card>
  )
}

export interface LegendItem {
  label: string
  color: string
}

/** Identity is never carried by colour alone — every multi-series chart shows this. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

interface TooltipRow {
  label: string
  value: number
  color?: string
}

/** Shared tooltip body — every chart formats money the same way. */
export function ChartTooltip({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      {title && <p className="mb-1.5 text-xs font-medium">{title}</p>}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-xs">
            {row.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="mr-auto text-muted-foreground">{row.label}</span>
            <span className="tabular font-medium">{formatIDR(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
