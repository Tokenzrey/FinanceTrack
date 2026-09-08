'use client'

import { useMemo } from 'react'
import { addDays, format, isMonday, startOfMonth } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

import { cn } from '@/shared/lib/utils'
import type { TimelineZoom } from '@/shared/lib/timeline-scale'

interface TimelineRulerProps {
  rangeStart: Date
  dayCount: number
  colWidth: number
  zoom: TimelineZoom
  /** Horizontal px of the "now" line within the grid body, or null if now is out of range. */
  nowOffsetPx: number | null
  /** Injectable clock for the "now" header label (tests). */
  now?: Date
}

/** Days grouped into contiguous calendar-month runs within the range. */
function monthRuns(rangeStart: Date, dayCount: number) {
  const runs: { label: string; days: number }[] = []
  for (let i = 0; i < dayCount; i++) {
    const day = addDays(rangeStart, i)
    const label = format(startOfMonth(day), 'MMMM yyyy', { locale: idLocale })
    const last = runs[runs.length - 1]
    if (last && last.label === label) last.days += 1
    else runs.push({ label, days: 1 })
  }
  return runs
}

/** Tier-2 label for one day cell — density depends on zoom. */
function dayLabel(day: Date, zoom: TimelineZoom): string {
  if (zoom === 'day') return format(day, 'EEE d', { locale: idLocale }) // "Sen 2"
  if (zoom === 'week') return isMonday(day) ? format(day, 'd MMM', { locale: idLocale }) : ''
  // month: 1st is covered by tier 1; a faint weekly tick otherwise.
  return day.getDate() === 1 ? format(day, 'd', { locale: idLocale }) : ''
}

/**
 * Sticky two-tier timeline header: month tier (Sora / `font-display`) over a day
 * tier (mono). Also paints the "now" indicator's header time label. Consumed by
 * `TimelineView`.
 */
export function TimelineRuler({
  rangeStart,
  dayCount,
  colWidth,
  zoom,
  nowOffsetPx,
  now = new Date(),
}: TimelineRulerProps) {
  const runs = useMemo(() => monthRuns(rangeStart, dayCount), [rangeStart, dayCount])
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, dayCount],
  )

  return (
    <div className="sticky top-0 z-20 w-max bg-background">
      {/* Tier 1 — months */}
      <div className="flex border-b border-border">
        {runs.map((run, i) => (
          <div
            key={`${run.label}-${i}`}
            className="shrink-0 truncate border-l border-border px-2 py-1 font-display text-xs font-semibold first:border-l-0"
            style={{ width: run.days * colWidth }}
          >
            {run.label}
          </div>
        ))}
      </div>

      {/* Tier 2 — days */}
      <div className="relative flex border-b border-border">
        {days.map((day, i) => {
          const weekend = day.getDay() === 0 || day.getDay() === 6
          const monthStart = day.getDate() === 1
          return (
            <div
              key={i}
              className={cn(
                'shrink-0 overflow-hidden whitespace-nowrap border-l py-1 text-center font-mono text-[10px] tabular-nums text-muted-foreground',
                monthStart ? 'border-border' : 'border-border/40',
                weekend && 'bg-muted/20',
              )}
              style={{ width: colWidth }}
            >
              {dayLabel(day, zoom)}
            </div>
          )
        })}

        {/* "now" header label + tick */}
        {nowOffsetPx != null && (
          <div
            className="pointer-events-none absolute bottom-0 flex flex-col items-center"
            style={{ left: nowOffsetPx, transform: 'translateX(-50%)' }}
          >
            <span className="font-mono text-[10px] leading-none text-primary">
              {format(now, 'HH.mm')}
            </span>
            <span className="mt-0.5 h-1 w-px bg-primary" aria-hidden />
          </div>
        )}
      </div>
    </div>
  )
}
