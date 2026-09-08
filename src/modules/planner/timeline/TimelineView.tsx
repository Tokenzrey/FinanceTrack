'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  startOfWeek,
} from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Timestamp } from 'firebase/firestore'

import { Button } from '@/shared/components/ui/button'
import {
  COL_WIDTH,
  columnForDate,
  fractionOfDay,
  type TimelineZoom,
} from '@/shared/lib/timeline-scale'
import { cn } from '@/shared/lib/utils'
import { usePlannerStore } from '@/shared/stores/planner.store'
import type { Task } from '@/shared/types/productivity'
import { applyBoardFilters, describeActiveFilters } from '../shared/FilterBar'
import { TimelineRuler } from './TimelineRuler'

const ROW_HEIGHT = 32
/** Left name gutter — `w-44` (176px) on mobile, `w-60` (240px) from `sm`. */
const GUTTER_CLASS = 'w-44 sm:w-60'
const GUTTER_PX_MOBILE = 176
const GUTTER_PX_DESKTOP = 240

const ZOOM_TABS: { value: TimelineZoom; label: string }[] = [
  { value: 'day', label: 'Hari' },
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
]

/** Earliest and latest instants a task occupies on the timeline. */
function taskSpan(t: Task): { min: Date; max: Date } | null {
  const start = (t.startAt ?? t.dueAt) as Timestamp | null
  const end = (t.dueAt ?? t.startAt) as Timestamp | null
  if (!start || !end) return null
  return { min: start.toDate(), max: end.toDate() }
}

export function TimelineView() {
  const tasks = usePlannerStore((s) => s.tasks)
  const filters = usePlannerStore((s) => s.filters)
  const lists = usePlannerStore((s) => s.lists)
  const labels = usePlannerStore((s) => s.labels)
  const clearFilters = usePlannerStore((s) => s.clearFilters)
  const openTask = usePlannerStore((s) => s.openTask)
  // Task 14: read `useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ` here when
  // converting bar edges to wall-clock. Task 13's "now" line is `new Date()` in the
  // ambient zone, so no tz needed yet.

  const [zoom, setZoom] = useState<TimelineZoom>('week')
  const [trayOpen, setTrayOpen] = useState(true)

  // Re-render the "now" line every minute so it creeps. No animation — just a
  // position recompute; honors prefers-reduced-motion for free.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const visible = useMemo(() => applyBoardFilters(tasks, filters), [tasks, filters])

  const { scheduled, unscheduled } = useMemo(() => {
    const s: Task[] = []
    const u: Task[] = []
    for (const t of visible) {
      if (t.startAt || t.dueAt) s.push(t)
      else u.push(t)
    }
    // Stable order: earliest span first, then title.
    s.sort((a, b) => {
      const sa = taskSpan(a)
      const sb = taskSpan(b)
      const ta = sa ? sa.min.getTime() : 0
      const tb = sb ? sb.min.getTime() : 0
      return ta - tb || a.title.localeCompare(b.title)
    })
    return { scheduled: s, unscheduled: u }
  }, [visible])

  const { rangeStart, dayCount } = useMemo(() => {
    const today = new Date()
    let min = today
    let max = today
    for (const t of scheduled) {
      const span = taskSpan(t)
      if (!span) continue
      if (span.min < min) min = span.min
      if (span.max > max) max = span.max
    }
    const start = addDays(startOfWeek(min, { weekStartsOn: 1 }), -3)
    const end = addDays(endOfWeek(max, { weekStartsOn: 1 }), 3)
    return { rangeStart: start, dayCount: differenceInCalendarDays(end, start) + 1 }
  }, [scheduled])

  const colWidth = COL_WIDTH[zoom]
  const gridWidth = dayCount * colWidth

  // "now" offset in px within the grid body, or null if today is outside the range.
  const nowCol = columnForDate(now, rangeStart)
  const nowOffsetPx =
    nowCol >= 0 && nowCol < dayCount ? (nowCol + fractionOfDay(now)) * colWidth : null

  // Day cells forming a row's background (weekend wash + month dividers).
  const dayCells = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = addDays(rangeStart, i)
        return {
          weekend: d.getDay() === 0 || d.getDay() === 6,
          monthStart: d.getDate() === 1,
        }
      }),
    [rangeStart, dayCount],
  )

  const activeFilters = describeActiveFilters(filters, lists, labels)

  if (scheduled.length === 0 && unscheduled.length === 0) {
    if (activeFilters.length > 0) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada tugas yang cocok dengan filter: {activeFilters.join(', ')}.
          </p>
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Hapus filter
          </Button>
        </div>
      )
    }
    return (
      <p className="rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Belum ada tugas terjadwal. Tambahkan tanggal mulai atau jatuh tempo dari panel tugas.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Zoom toggle — matches the board's Rapat/Nyaman button-group style. */}
      <div className="flex items-center justify-end gap-1">
        {ZOOM_TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={zoom === t.value ? 'default' : 'outline'}
            onClick={() => setZoom(t.value)}
            aria-pressed={zoom === t.value}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Horizontal scroll region — the page body never scrolls sideways. */}
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <div className="w-max">
          {/* Header row: sticky gutter corner + sticky two-tier ruler. */}
          <div className="sticky top-0 z-30 flex bg-background">
            <div
              className={cn(
                'sticky left-0 z-40 shrink-0 border-b border-r border-border bg-background',
                GUTTER_CLASS,
              )}
            />
            <TimelineRuler
              rangeStart={rangeStart}
              dayCount={dayCount}
              colWidth={colWidth}
              zoom={zoom}
              nowOffsetPx={nowOffsetPx}
              now={now}
            />
          </div>

          {/* Task rows */}
          <div className="relative">
            {scheduled.map((task) => (
              <div key={task.id} className="flex" style={{ height: ROW_HEIGHT }}>
                {/* Sticky name gutter */}
                <div
                  className={cn(
                    'sticky left-0 z-20 flex shrink-0 items-center border-b border-r border-border bg-background px-2',
                    GUTTER_CLASS,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="truncate rounded text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {task.title}
                  </button>
                </div>

                {/* Grid track — day-cell background; Task 14 mounts the bar here. */}
                <div
                  className="relative flex border-b border-border"
                  style={{ width: gridWidth, height: ROW_HEIGHT }}
                >
                  {dayCells.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-full shrink-0 border-l',
                        c.monthStart ? 'border-border' : 'border-border/30',
                        c.weekend && 'bg-muted/20',
                      )}
                      style={{ width: colWidth }}
                    />
                  ))}
                  {/* Task 14: <TimelineBar task={task} rangeStart={rangeStart} colWidth={colWidth} zoom={zoom} />
                      Task 14: reminder pins for this task go here (absolutely positioned in this relative row).
                      Task 14: dependency arrows are drawn in an overlay above the rows container. */}
                </div>
              </div>
            ))}

            {/* "now" line — spans the rows area, offset past the sticky gutter.
                Two elements so the offset is correct at both gutter widths
                (`w-44` mobile / `w-60` from `sm`) without injected CSS. */}
            {nowOffsetPx != null && scheduled.length > 0 && (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary sm:hidden"
                  style={{ left: GUTTER_PX_MOBILE + nowOffsetPx }}
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 hidden w-px bg-primary sm:block"
                  style={{ left: GUTTER_PX_DESKTOP + nowOffsetPx }}
                  aria-hidden
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* "Belum dijadwalkan" tray — collapsible, below the grid. */}
      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setTrayOpen((v) => !v)}
            aria-expanded={trayOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {trayOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="font-display text-sm font-semibold">Belum dijadwalkan</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {unscheduled.length}
            </span>
          </button>
          {trayOpen && (
            <ul className="border-t border-border">
              {unscheduled.map((task) => (
                // Task 14: draggable to grid gives it a date
                <li key={task.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
