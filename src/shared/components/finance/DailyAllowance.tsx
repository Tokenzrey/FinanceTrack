import { CalendarClock } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatIDR } from '@/shared/lib/format'

interface DailyAllowanceProps {
  /** Money still available, spread across the days left. */
  perDay: number
  daysLeft: number
  className?: string
}

export function DailyAllowance({ perDay, daysLeft, className }: DailyAllowanceProps) {
  const exhausted = daysLeft === 0 || perDay <= 0

  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <CalendarClock className="size-4 shrink-0" aria-hidden />
      {exhausted ? (
        <span>Jatah harian habis</span>
      ) : (
        <span>
          <span className="tabular font-semibold text-foreground">{formatIDR(perDay)}</span>
          {' / hari — sisa '}
          <span className="font-medium text-foreground">{daysLeft} hari</span>
        </span>
      )}
    </div>
  )
}
