// The timeline's visible date window, and how it grows as the user scrolls.
//
// The grid is one column per calendar day (see `timeline-scale.ts`), so a
// "range" is just a start date plus a day count. Scrolling near either edge
// extends that side rather than snapping to a new page, which is what makes the
// timeline feel continuous instead of month-bound.

import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'

import type { TimelineZoom } from './timeline-scale'

export interface TimelineRange {
  /** Local midnight of the first column. Always a Monday, so week labels align. */
  start: Date
  /** Number of day-columns rendered. */
  dayCount: number
}

/** Days added per extension step. One step should overshoot a viewport so the
 *  user cannot outrun it with a single flick. */
export const EXTEND_DAYS = 56

/** Hard ceiling on rendered columns (~10 years). At `month` zoom that is still
 *  only ~29k px of grid; the guard exists so a stuck scroll handler cannot
 *  allocate without bound. */
export const MAX_RANGE_DAYS = 3650

/** How much window each zoom wants on first paint. A tighter column fits more
 *  days in the same pixels, so `month` opens wider than `day`. */
const INITIAL_DAYS: Record<TimelineZoom, number> = {
  day: 35,
  week: 63,
  month: 182,
}

/** Breathing room kept before the earliest and after the latest task. */
const TASK_PAD_DAYS = 14

export interface TaskSpan {
  min: Date
  max: Date
}

/**
 * The window to open with: a zoom-sized band around `today`, widened to contain
 * every task span. Starts on a Monday so the week ruler's labels line up.
 */
export function initialRange(zoom: TimelineZoom, today: Date, spans: TaskSpan[]): TimelineRange {
  const want = INITIAL_DAYS[zoom]

  let min = addDays(today, -Math.floor(want / 3))
  let max = addDays(today, want - Math.floor(want / 3))

  for (const span of spans) {
    if (span.min < min) min = addDays(span.min, -TASK_PAD_DAYS)
    if (span.max > max) max = addDays(span.max, TASK_PAD_DAYS)
  }

  const start = startOfWeek(min, { weekStartsOn: 1 })
  const dayCount = Math.min(differenceInCalendarDays(max, start) + 1, MAX_RANGE_DAYS)
  return { start, dayCount }
}

/**
 * Grow the window at one edge. Returns the same object (referentially) when the
 * cap is already reached, so a caller can `setState(extendRange(r, edge))`
 * without forcing a re-render on every scroll event once maxed out.
 *
 * Extending `'start'` moves the first column earlier — every existing column
 * shifts right by `EXTEND_DAYS * colWidth`, so the caller must add that to
 * `scrollLeft` in the same frame or the view visibly jumps.
 */
export function extendRange(range: TimelineRange, edge: 'start' | 'end'): TimelineRange {
  const room = MAX_RANGE_DAYS - range.dayCount
  if (room <= 0) return range

  const grow = Math.min(EXTEND_DAYS, room)
  return edge === 'end'
    ? { start: range.start, dayCount: range.dayCount + grow }
    : { start: addDays(range.start, -grow), dayCount: range.dayCount + grow }
}

/** Zoom levels, coarse → fine, for the −/+ stepper. */
export const ZOOM_ORDER: TimelineZoom[] = ['month', 'week', 'day']

/**
 * One step along `ZOOM_ORDER`. `+1` zooms in (wider columns, less calendar on
 * screen); `-1` zooms out. Clamps at both ends so the buttons can simply
 * disable rather than wrap around to the opposite extreme.
 */
export function stepZoom(zoom: TimelineZoom, dir: -1 | 1): TimelineZoom {
  const i = ZOOM_ORDER.indexOf(zoom)
  const next = Math.min(ZOOM_ORDER.length - 1, Math.max(0, i + dir))
  return ZOOM_ORDER[next]
}

/** Days one "period" jump covers at each zoom — a screenful-ish shift. */
export const PERIOD_DAYS: Record<TimelineZoom, number> = {
  day: 14,
  week: 28,
  month: 90,
}
