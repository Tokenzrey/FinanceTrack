'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Timestamp } from 'firebase/firestore'

import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { DEFAULT_TZ } from '@/shared/lib/format'
import {
  EXTEND_DAYS,
  extendRange,
  initialRange,
  type TimelineRange,
} from '@/shared/lib/timeline-range'
import {
  COL_WIDTH,
  columnForDate,
  fractionOfDay,
  type TimelineZoom,
} from '@/shared/lib/timeline-scale'
import { cn } from '@/shared/lib/utils'
import { useAuthStore } from '@/shared/stores/auth.store'
import { usePlannerStore } from '@/shared/stores/planner.store'
import type { Reminder, Task } from '@/shared/types/productivity'
import { setTaskSchedule } from '@/shared/use-cases/board/SetTaskSchedule.usecase'
import { useTaskLeads } from '../list/ListView'
import { applyBoardFilters, describeActiveFilters } from '../shared/FilterBar'
import { DependencyArrow } from './DependencyArrow'
import { TimelineBar } from './TimelineBar'
import { TimelineRuler } from './TimelineRuler'

const ROW_HEIGHT = 40
/** Left name gutter — `w-44` (176px) on mobile, `w-60` (240px) from `sm`.
 *  The px widths live in the `--tl-gutter` CSS var on the scroll region. */
const GUTTER_CLASS = 'w-44 sm:w-60'

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
  const reminders = usePlannerStore((s) => s.reminders)

  // Scale math stays ambient-zone (single-user Asia/Jakarta, no DST — matches the
  // "now" line). `tz` is only for displayed date/time strings inside the bar.
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const uid = useAuthStore((s) => s.user?.uid)
  const leads = useTaskLeads()

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

  // The window the user is looking at. Seeded from the tasks + zoom, then grown
  // at whichever edge they scroll toward — see `onScroll` below.
  const spans = useMemo(
    () => scheduled.map(taskSpan).filter((sp): sp is { min: Date; max: Date } => sp != null),
    [scheduled],
  )
  const [range, setRange] = useState<TimelineRange>(() => initialRange(zoom, new Date(), spans))

  // Re-seed when the zoom changes or a task moves outside the current window.
  // `spans` is recomputed per render, so compare by value, not identity.
  const seedKey = useMemo(
    () => `${zoom}|${spans.map((sp) => `${sp.min.getTime()}-${sp.max.getTime()}`).join(',')}`,
    [zoom, spans],
  )
  const lastSeedRef = useRef(seedKey)
  useEffect(() => {
    if (lastSeedRef.current === seedKey) return
    lastSeedRef.current = seedKey
    setRange(initialRange(zoom, new Date(), spans))
    // `spans` intentionally excluded: `seedKey` is its value-identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, zoom])

  const rangeStart = range.start
  const dayCount = range.dayCount

  const colWidth = COL_WIDTH[zoom]
  const gridWidth = dayCount * colWidth

  // Infinite scroll. Within two viewport-widths of an edge, grow that side.
  // Growing at the start shifts every column right, so we add the same pixel
  // delta to `scrollLeft` in a layout effect — otherwise the view jumps back.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pendingLeftShiftRef = useRef(0)

  useLayoutEffect(() => {
    const shift = pendingLeftShiftRef.current
    if (shift === 0 || !scrollRef.current) return
    pendingLeftShiftRef.current = 0
    scrollRef.current.scrollLeft += shift
  }, [range])

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const threshold = el.clientWidth * 2
      if (el.scrollLeft < threshold) {
        setRange((r) => {
          const next = extendRange(r, 'start')
          if (next !== r) pendingLeftShiftRef.current += EXTEND_DAYS * colWidth
          return next
        })
      } else if (el.scrollWidth - el.scrollLeft - el.clientWidth < threshold) {
        setRange((r) => extendRange(r, 'end'))
      }
    },
    [colWidth],
  )

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

  // This task's active (`pending`/`sending`) + `failed` reminders. `sent` /
  // `cancelled` are not drawn.
  const remindersByTask = useMemo(() => {
    const m = new Map<string, Reminder[]>()
    for (const r of reminders) {
      if (!r.taskId) continue
      if (r.status !== 'pending' && r.status !== 'sending' && r.status !== 'failed') continue
      const list = m.get(r.taskId)
      if (list) list.push(r)
      else m.set(r.taskId, [r])
    }
    return m
  }, [reminders])

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])

  // Dependency arrows — only between two scheduled (bar-bearing) tasks. `conflict`
  // when the blocker's end slips past the dependent's start.
  const dependencyArrows = useMemo(() => {
    const rowByTask = new Map<string, number>()
    scheduled.forEach((t, i) => rowByTask.set(t.id, i))
    const geom = (t: Task) => {
      const startD = (t.startAt ?? t.dueAt)!.toDate()
      const endD = (t.dueAt ?? t.startAt)!.toDate()
      const leftPx = (columnForDate(startD, rangeStart) + fractionOfDay(startD)) * colWidth
      const endPx = (columnForDate(endD, rangeStart) + fractionOfDay(endD)) * colWidth
      return { leftPx, rightPx: Math.max(endPx, leftPx + 6), startD, endD }
    }
    const out: { key: string; from: { x: number; y: number }; to: { x: number; y: number }; conflict: boolean }[] = []
    for (const dep of scheduled) {
      const depRow = rowByTask.get(dep.id)
      if (depRow == null || !dep.dependsOn?.length) continue
      const depG = geom(dep)
      for (const blockerId of dep.dependsOn) {
        const blockerRow = rowByTask.get(blockerId)
        if (blockerRow == null) continue
        const blocker = scheduled[blockerRow]
        const blG = geom(blocker)
        out.push({
          key: `${dep.id}<-${blockerId}`,
          from: { x: depG.leftPx, y: depRow * ROW_HEIGHT + ROW_HEIGHT / 2 },
          to: { x: blG.rightPx, y: blockerRow * ROW_HEIGHT + ROW_HEIGHT / 2 },
          conflict: blG.endD.getTime() > depG.startD.getTime(),
        })
      }
    }
    return out
  }, [scheduled, rangeStart, colWidth])

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

      {/* Scroll region — bounded height so `sticky top-0` on the two-tier header
          has a scrollport; the page body never scrolls sideways. `--tl-gutter`
          holds the sticky-gutter width so the "now" line and the dependency
          overlay position with one `calc()` instead of a per-breakpoint element. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin relative max-h-[calc(100dvh-16rem)] overflow-auto rounded-xl border border-border [--tl-gutter:176px] sm:[--tl-gutter:240px]"
      >
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
                  {/* Bar + reminder pins for this task (absolute within this track). */}
                  <TimelineBar
                    task={task}
                    rangeStart={rangeStart}
                    colWidth={colWidth}
                    zoom={zoom}
                    labelsById={labelsById}
                    gridWidth={gridWidth}
                    reminders={remindersByTask.get(task.id) ?? []}
                    tz={tz}
                    onCommitSchedule={(patch) => {
                      if (uid) {
                        setTaskSchedule(uid, task, patch, leads).catch(() =>
                          toast.error('Gagal menyimpan jadwal.'),
                        )
                      }
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Dependency-arrow overlay — over the rows, offset past the gutter. */}
            {dependencyArrows.length > 0 && (
              <svg
                className="pointer-events-none absolute top-0 z-10"
                style={{
                  left: 'var(--tl-gutter)',
                  width: gridWidth,
                  height: scheduled.length * ROW_HEIGHT,
                }}
                aria-hidden
              >
                {dependencyArrows.map((a) => (
                  <DependencyArrow key={a.key} from={a.from} to={a.to} conflict={a.conflict} />
                ))}
              </svg>
            )}

            {/* "now" line — one element, positioned past the sticky gutter via `--tl-gutter`. */}
            {nowOffsetPx != null && scheduled.length > 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary"
                style={{ left: `calc(var(--tl-gutter) + ${nowOffsetPx}px)` }}
                aria-hidden
              />
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
