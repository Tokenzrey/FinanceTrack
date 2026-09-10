'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { addDays, format, set } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

import { cn } from '@/shared/lib/utils'
import { columnForDate, fractionOfDay, type TimelineZoom } from '@/shared/lib/timeline-scale'
import { usePlannerStore } from '@/shared/stores/planner.store'
import type { Label } from '@/shared/types/board'
import { LABEL_COLORS } from '@/shared/types/board'
import type { Reminder, Task } from '@/shared/types/productivity'
import { ReminderPin } from './ReminderPin'

const BAR_HEIGHT = 34
const BAR_TOP = 7
/** Pointer travel (px) before a press becomes a drag — mirrors `useDragSort`. */
const DRAG_THRESHOLD = 6
/** Below this width the title sits outside the bar (to the right). */
const TITLE_INSIDE_MIN_WIDTH = 70
/** Don't bother with an outside title if this little room is left in the track. */
const MIN_OUTSIDE_TITLE_WIDTH = 32
/** Widest an outside title may run before truncating. */
const MAX_OUTSIDE_TITLE_WIDTH = 220

interface TimelineBarProps {
  task: Task
  rangeStart: Date
  colWidth: number
  zoom: TimelineZoom
  labelsById: Map<string, Label>
  /** Full track width, so an outside title can be clamped to what remains. */
  gridWidth: number
  /** This task's active + failed reminders, pre-filtered by `TimelineView`. */
  reminders: Reminder[]
  tz: string
  onCommitSchedule: (patch: { startAt?: Date | null; dueAt?: Date | null }) => void
}

const SCHEDULE_FILL: Record<Task['status'], string> = {
  todo: 'hsl(var(--schedule-planned))',
  doing: 'hsl(var(--schedule-active))',
  done: 'hsl(var(--schedule-done))',
}

const PRIORITY_CAP: Record<Task['priority'], string> = {
  low: 'bg-foreground/20',
  med: 'bg-foreground/40',
  high: 'bg-destructive',
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  mode: DragMode
  startX: number
  pointerId: number
  /** Live result while dragging — rendered and committed on pointerup. */
  next: { startAt: Date; dueAt: Date }
}

/** px offset within the grid track for an instant. */
function pxForDate(d: Date, rangeStart: Date, colWidth: number): number {
  return (columnForDate(d, rangeStart) + fractionOfDay(d)) * colWidth
}

/** A pointer dx snaps to a whole number of day columns. Shifting a date by that
 *  many calendar days lands it on the grid and keeps its original time-of-day. */
function shiftByDx(d: Date, dx: number, colWidth: number): Date {
  return addDays(d, Math.round(dx / colWidth))
}

export function TimelineBar({
  task,
  rangeStart,
  colWidth,
  zoom,
  labelsById,
  gridWidth,
  reminders,
  tz,
  onCommitSchedule,
}: TimelineBarProps) {
  const openTask = usePlannerStore((s) => s.openTask)

  const startMs = (task.startAt ?? task.dueAt)!.toMillis()
  const endMs = (task.dueAt ?? task.startAt)!.toMillis()
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)
  const durationMs = Math.max(endMs - startMs, 0)

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  // Set on pointerup after a real drag; the following click is then ignored.
  const draggedRef = useRef(false)

  // Committed geometry, or the live drag override.
  const effStart = drag ? drag.next.startAt : startDate
  const effEnd = drag ? drag.next.dueAt : endDate

  const rawLeftPx = pxForDate(effStart, rangeStart, colWidth)
  const rawEndPx = pxForDate(effEnd, rangeStart, colWidth)
  // Clamp into the track: a task that starts before the visible range (or ends
  // after it) must not bleed the bar — or its inside title — past the grid edges
  // into the sticky name gutter on the left.
  const leftPx = Math.max(rawLeftPx, 0)
  const endPx = Math.min(Math.max(rawEndPx, leftPx + 6), gridWidth)
  const widthPx = Math.max(endPx - leftPx, 6)
  const clippedStart = rawLeftPx < 0
  const clippedEnd = rawEndPx > gridWidth

  const onCommitRef = useRef(onCommitSchedule)
  onCommitRef.current = onCommitSchedule

  // Window listeners for the whole lifetime — no-op unless a drag is active.
  useEffect(() => {
    function computeNext(mode: DragMode, dx: number): { startAt: Date; dueAt: Date } {
      if (mode === 'move') {
        const newStart = shiftByDx(startDate, dx, colWidth)
        return { startAt: newStart, dueAt: new Date(newStart.getTime() + durationMs) }
      }
      if (mode === 'resize-start') {
        let newStart = shiftByDx(startDate, dx, colWidth)
        // Don't let the bar invert — clamp to one day before the (fixed) end.
        if (newStart.getTime() >= endDate.getTime()) {
          newStart = set(addDays(endDate, -1), {
            hours: startDate.getHours(),
            minutes: startDate.getMinutes(),
            seconds: startDate.getSeconds(),
            milliseconds: 0,
          })
        }
        return { startAt: newStart, dueAt: endDate }
      }
      // resize-end
      let newEnd = shiftByDx(endDate, dx, colWidth)
      if (newEnd.getTime() <= startDate.getTime()) {
        newEnd = set(addDays(startDate, 1), {
          hours: endDate.getHours(),
          minutes: endDate.getMinutes(),
          seconds: endDate.getSeconds(),
          milliseconds: 0,
        })
      }
      return { startAt: startDate, dueAt: newEnd }
    }

    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const dx = e.clientX - d.startX
      if (Math.abs(dx) <= DRAG_THRESHOLD && d.next === PENDING) {
        // Still under threshold — keep it a candidate (PENDING sentinel).
        return
      }
      const next = computeNext(d.mode, dx)
      setDrag({ ...d, next })
      dragRef.current = { ...d, next }
    }

    function onUp(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const dx = e.clientX - d.startX
      // Gate on the computed dates actually differing from the originals — a press
      // that crossed the threshold then drifted back is a click, not a drag.
      const next = d.next === PENDING ? computeNext(d.mode, dx) : d.next
      const changed =
        d.mode === 'move'
          ? next.startAt.getTime() !== startDate.getTime() ||
            next.dueAt.getTime() !== endDate.getTime()
          : d.mode === 'resize-start'
            ? next.startAt.getTime() !== startDate.getTime()
            : next.dueAt.getTime() !== endDate.getTime()

      if (changed) {
        // A real drag just ended — suppress the click that jsdom/browsers fire next.
        draggedRef.current = true
        if (d.mode === 'move') {
          onCommitRef.current({ startAt: next.startAt, dueAt: next.dueAt })
        } else if (d.mode === 'resize-start') {
          onCommitRef.current({ startAt: next.startAt })
        } else {
          onCommitRef.current({ dueAt: next.dueAt })
        }
      }
      setDrag(null)
      dragRef.current = null
    }

    function onCancel(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      setDrag(null)
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // startDate/endDate are fresh Date objects every render; key on their millis
    // instead so the listeners don't re-subscribe on the parent's 60s now-tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, durationMs, rangeStart, colWidth])

  const beginDrag = useCallback(
    (mode: DragMode, e: React.PointerEvent) => {
      // Do NOT preventDefault — a plain click must still open the task.
      // Every new press starts clean, in case a prior pointerup missed its click.
      draggedRef.current = false
      const state: DragState = {
        mode,
        startX: e.clientX,
        pointerId: e.pointerId,
        next: PENDING,
      }
      setDrag(state)
      dragRef.current = state
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // jsdom / unsupported — window listeners still cover it.
      }
    },
    [],
  )

  const firstLabel = task.labelIds?.length ? labelsById.get(task.labelIds[0]) : undefined
  const titleInside = widthPx > TITLE_INSIDE_MIN_WIDTH
  const outsideTitleWidth = Math.min(
    MAX_OUTSIDE_TITLE_WIDTH,
    Math.max(0, gridWidth - (leftPx + widthPx + 6)),
  )
  const dragging = drag != null && drag.next !== PENDING

  const fmtDay = (d: Date) => format(d, 'd MMM', { locale: idLocale })

  return (
    <>
      {/* The bar */}
      <div
        role="button"
        tabIndex={0}
        aria-label={task.title}
        className={cn(
          'group absolute rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging
            ? 'cursor-grabbing'
            : 'cursor-grab transition-[left,width] duration-200 ease-out motion-reduce:transition-none',
          // Square off an edge that runs past the visible range — it continues off-screen.
          clippedStart && 'rounded-l-none',
          clippedEnd && 'rounded-r-none',
        )}
        style={{
          left: leftPx,
          width: widthPx,
          height: BAR_HEIGHT,
          top: BAR_TOP,
          background: SCHEDULE_FILL[task.status],
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return
          beginDrag('move', e)
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false
            return
          }
          openTask(task.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openTask(task.id)
          }
        }}
      >
        {/* Label top line — 2px, first label's colour (two-span dark toggle, per LabelStrip). */}
        {firstLabel ? (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 flex h-[2px] overflow-hidden rounded-t-md"
          >
            <span className={cn('flex-1 dark:hidden', LABEL_COLORS[firstLabel.colorKey].light)} />
            <span className={cn('hidden flex-1 dark:block', LABEL_COLORS[firstLabel.colorKey].dark)} />
          </span>
        ) : task.labelIds?.length ? (
          <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] rounded-t-md bg-foreground/30" />
        ) : null}

        {/* Priority left cap — 3px strip, not the whole bar. */}
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-[3px] rounded-l-md', PRIORITY_CAP[task.priority])}
        />

        {/* Title inside when wide enough. `overflow-hidden` on the bar-width box so a
            long title clips at the bar's right edge instead of spilling out. */}
        {titleInside && (
          <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden pl-2.5 pr-2 text-xs font-medium text-foreground">
            <span className="truncate">{task.title}</span>
          </span>
        )}

        {/* Resize handles — 6px, visible on hover. */}
        <span
          data-handle="start"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-foreground/20 opacity-0 group-hover:opacity-100"
          onPointerDown={(e) => {
            e.stopPropagation()
            beginDrag('resize-start', e)
          }}
        />
        <span
          data-handle="end"
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-foreground/20 opacity-0 group-hover:opacity-100"
          onPointerDown={(e) => {
            e.stopPropagation()
            beginDrag('resize-end', e)
          }}
        />

        {/* Sticking drag tooltip. */}
        {dragging && (
          <div
            className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background"
            role="status"
          >
            {drag!.mode === 'resize-start'
              ? fmtDay(effStart)
              : drag!.mode === 'resize-end'
                ? fmtDay(effEnd)
                : `${fmtDay(effStart)} – ${fmtDay(effEnd)}`}
          </div>
        )}
      </div>

      {/* Title outside (to the right) when the bar is too narrow to hold it.
          Height is pinned to the bar so the text can never bleed into the row
          above or below, and the width is clamped to the track that actually
          remains — an unbounded `max-w` overflowed the grid on late-range bars. */}
      {!titleInside && outsideTitleWidth >= MIN_OUTSIDE_TITLE_WIDTH && (
        <span
          className="pointer-events-none absolute flex items-center truncate text-xs font-medium text-foreground"
          style={{
            left: leftPx + widthPx + 8,
            top: BAR_TOP,
            width: outsideTitleWidth,
            height: BAR_HEIGHT,
            lineHeight: `${BAR_HEIGHT}px`,
          }}
        >
          {task.title}
        </span>
      )}

      {/* Reminder pins — siblings of the bar in the row track, at true time. */}
      {reminders.map((r) => (
        <ReminderPin
          key={r.id}
          reminder={r}
          rangeStart={rangeStart}
          colWidth={colWidth}
          zoom={zoom}
          tz={tz}
        />
      ))}
    </>
  )
}

/** Sentinel: a press that has not yet passed the drag threshold. Referenced by
 *  identity so `next === PENDING` means "candidate, not dragging". */
const PENDING = { startAt: new Date(0), dueAt: new Date(0) } as { startAt: Date; dueAt: Date }
