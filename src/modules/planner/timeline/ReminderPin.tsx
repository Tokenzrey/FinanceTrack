'use client'

import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'
import {
  columnForDate,
  fractionOfDay,
  type TimelineZoom,
} from '@/shared/lib/timeline-scale'
import type { Reminder } from '@/shared/types/productivity'

interface ReminderPinProps {
  reminder: Reminder
  rangeStart: Date
  colWidth: number
  zoom: TimelineZoom
  tz: string
}

/** 5px dot marking a reminder's fire time inside the bar body. A `failed`
 *  reminder is an empty destructive ring instead of a filled dot — the timeline
 *  is the one place that shows the plan *and* the machine executing it. */
export function ReminderPin({ reminder, rangeStart, colWidth, zoom }: ReminderPinProps) {
  void zoom // signature symmetry; position is day-index + intra-day fraction
  const at = reminder.remindAt.toDate()
  const leftPx = (columnForDate(at, rangeStart) + fractionOfDay(at)) * colWidth

  const timeLabel = format(at, 'HH.mm', { locale: idLocale })
  const failed = reminder.status === 'failed'
  const ariaLabel = `Pengingat ${timeLabel}: ${reminder.message}${failed ? ' (gagal terkirim)' : ''}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={ariaLabel}
          data-reminder-pin={reminder.status}
          tabIndex={0}
          className={cn(
            'absolute h-[5px] w-[5px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            failed ? 'border border-destructive bg-transparent' : 'bg-primary',
          )}
          style={{ left: leftPx - 2.5, top: 7 + 17 - 2.5 }}
        />
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <span className="font-mono">{timeLabel}</span>
        <br />
        {reminder.message}
      </TooltipContent>
    </Tooltip>
  )
}
