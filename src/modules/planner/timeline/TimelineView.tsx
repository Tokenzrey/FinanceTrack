'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, Minus, Plus } from 'lucide-react'
import type { Timestamp } from 'firebase/firestore'

import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { useDragSort } from '@/shared/hooks/useDragSort'
import { useUndoStack } from '@/shared/hooks/useUndoStack'
import { DEFAULT_TZ } from '@/shared/lib/format'
import {
  EXTEND_DAYS,
  PERIOD_DAYS,
  extendRange,
  initialRange,
  stepZoom,
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
import { repositories } from '@/shared/repositories'
import { usePlannerStore } from '@/shared/stores/planner.store'
import type { Reminder, Task } from '@/shared/types/productivity'
import { reorderTimelineRow } from '@/shared/use-cases/board/ReorderTimelineRow.usecase'
import { setTaskSchedule } from '@/shared/use-cases/board/SetTaskSchedule.usecase'
import { useTaskLeads } from '../list/ListView'
import { PriorityDot } from '../shared/PriorityDot'
import { applyBoardFilters, describeActiveFilters } from '../shared/FilterBar'
import { DependencyArrow } from './DependencyArrow'
import { TimelineBar } from './TimelineBar'
import { TimelineRuler } from './TimelineRuler'

const ROW_HEIGHT = 48
/** Left name gutter — `w-56` (224px) on mobile, `w-72` (288px) from `sm`, `w-80` (320px) from `md`.
 *  The px widths live in the `--tl-gutter` CSS var on the scroll region. */
const GUTTER_CLASS = 'w-56 sm:w-72 md:w-80'

/** `useDragSort` container id for the row-reorder handles in the name gutter. */
const TIMELINE_ROWS_CONTAINER = 'timeline-rows'

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
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)

  const undo = useUndoStack((label) => toast.success(`Dibatalkan: ${label}`))

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
    // Manual row order wins when the user has dragged rows; otherwise fall back
    // to earliest-span-first so an untouched board still reads chronologically.
    s.sort((a, b) => {
      if (a.timelineOrder != null || b.timelineOrder != null) {
        return (
          (a.timelineOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.timelineOrder ?? Number.MAX_SAFE_INTEGER)
        )
      }
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

  /** Scroll so a given day-column sits a little in from the left gutter. */
  const scrollToDay = useCallback(
    (date: Date, behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current
      if (!el) return
      const col = columnForDate(date, rangeStart)
      // Land the target a third of the way in, so there is visible context behind it.
      const target = col * colWidth - el.clientWidth / 3
      el.scrollTo({ left: Math.max(0, target), behavior })
    },
    [rangeStart, colWidth],
  )

  const scrollToToday = useCallback(() => scrollToDay(new Date()), [scrollToDay])

  /** Jump one period left/right from wherever the viewport currently sits. */
  const shiftView = useCallback(
    (dir: -1 | 1) => {
      const el = scrollRef.current
      if (!el) return
      el.scrollBy({ left: dir * PERIOD_DAYS[zoom] * colWidth, behavior: 'smooth' })
    },
    [zoom, colWidth],
  )

  /** Bring a task's bar into view and flash it, so the gutter name is a jump link. */
  const focusTask = useCallback(
    (task: Task) => {
      const span = taskSpan(task)
      if (!span) return
      scrollToDay(span.min)
      setFocusedTaskId(task.id)
      window.setTimeout(() => setFocusedTaskId((cur) => (cur === task.id ? null : cur)), 1600)
    },
    [scrollToDay],
  )

  const rowDrag = useDragSort({
    containerId: TIMELINE_ROWS_CONTAINER,
    itemCount: scheduled.length,
    onDrop: (r) => {
      if (!uid || r.fromIndex === r.toIndex) return
      const prevOrders = scheduled.map((t) => ({ id: t.id, order: t.timelineOrder }))
      undo.push({
        label: 'urutkan baris',
        undo: () =>
          Promise.all(
            prevOrders.map((p) => repositories.tasks.update(uid, p.id, { timelineOrder: p.order })),
          ).then(() => undefined),
      })
      void reorderTimelineRow(uid, scheduled, r.fromIndex, r.toIndex).catch(() =>
        toast.error('Gagal mengurutkan baris.'),
      )
    },
  })

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
    const out: {
      key: string
      from: { x: number; y: number }
      to: { x: number; y: number }
      conflict: boolean
    }[] = []
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
      {/* Navigation + zoom. Without these the grid is several thousand px wide
          with no hint that anything exists past the first viewport. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="px-2"
            aria-label="Geser ke periode sebelumnya"
            onClick={() => shiftView(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button size="sm" variant="outline" onClick={scrollToToday}>
            Hari ini
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="px-2"
            aria-label="Geser ke periode berikutnya"
            onClick={() => shiftView(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="px-2"
            aria-label="Perkecil"
            disabled={zoom === 'month'}
            onClick={() => setZoom((z) => stepZoom(z, -1))}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
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
          <Button
            size="sm"
            variant="outline"
            className="px-2"
            aria-label="Perbesar"
            disabled={zoom === 'day'}
            onClick={() => setZoom((z) => stepZoom(z, 1))}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Scroll region — bounded height so `sticky top-0` on the two-tier header
          has a scrollport; the page body never scrolls sideways. `--tl-gutter`
          holds the sticky-gutter width so the "now" line and the dependency
          overlay position with one `calc()` instead of a per-breakpoint element. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin relative max-h-[calc(100dvh-17rem)] overflow-auto rounded-xl border border-border [--tl-gutter:224px] sm:[--tl-gutter:288px] md:[--tl-gutter:320px]"
      >
        <div className="w-max">
          {/* Header row: sticky gutter corner + sticky two-tier ruler. */}
          <div className="sticky top-0 z-30 flex bg-background">
            <div
              className={cn(
                'sticky left-0 z-40 flex shrink-0 items-center justify-between border-b border-r border-border bg-background px-3 py-2 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]',
                GUTTER_CLASS,
              )}
            >
              <span className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Daftar Tugas
              </span>
              <span className="font-mono text-xs text-muted-foreground/70">{scheduled.length}</span>
            </div>
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
          <div className="relative" data-dragsort-container={TIMELINE_ROWS_CONTAINER}>
            {scheduled.map((task, rowIndex) => (
              <div
                key={task.id}
                className="group/row flex"
                data-timeline-row
                style={{ height: ROW_HEIGHT }}
              >
                {/* Sticky name gutter - 100% opaque solid background */}
                <div
                  className={cn(
                    'sticky left-0 z-[30] flex shrink-0 items-center gap-1.5 border-b border-r border-border bg-background px-2.5 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]',
                    focusedTaskId === task.id ? 'hover:bg-muted/80' : 'hover:bg-muted/90',
                    GUTTER_CLASS,
                  )}
                >
                  <span
                    {...rowDrag.getItemProps(rowIndex)}
                    aria-label={`Ubah urutan baris ${task.title}`}
                    className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 motion-reduce:transition-none"
                  >
                    <GripVertical className="size-3.5" aria-hidden />
                  </span>
                  <PriorityDot priority={task.priority} />
                  <button
                    type="button"
                    onClick={() => focusTask(task)}
                    onDoubleClick={() => openTask(task.id)}
                    title={`${task.title} (Klik untuk fokus ke bar; klik dua kali untuk membuka tugas)`}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded text-left text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm',
                      task.status === 'done'
                        ? 'text-muted-foreground line-through'
                        : 'font-medium text-foreground',
                    )}
                  >
                    {task.title}
                  </button>
                </div>

                {/* Grid track — day-cell background; Task 14 mounts the bar here.
                    `overflow-hidden` keeps a bar (and its title) that starts before
                    the visible range from bleeding left over the sticky name gutter. */}
                <div
                  className={cn(
                    'relative flex overflow-hidden border-b border-border transition-colors duration-200 motion-reduce:transition-none',
                    focusedTaskId === task.id && 'bg-primary/5',
                  )}
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
                      if (!uid) return
                      const prev = {
                        startAt: task.startAt?.toDate() ?? null,
                        dueAt: task.dueAt?.toDate() ?? null,
                      }
                      undo.push({
                        label: 'ubah jadwal',
                        undo: () => setTaskSchedule(uid, task, prev, leads),
                      })
                      setTaskSchedule(uid, task, patch, leads).catch(() =>
                        toast.error('Gagal menyimpan jadwal.'),
                      )
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
