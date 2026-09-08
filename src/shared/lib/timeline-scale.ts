// Pure date <-> pixel math for the timeline (Gantt) grid.
//
// The grid is ALWAYS one column per calendar day. Zoom only scales the column
// WIDTH — it never changes the data structure or the day index.
//
// Timezone: every `Date` here is treated in the ambient zone (no `Intl`). The
// caller (`TimelineView`) is responsible for handing in dates already shifted to
// the user's zone if that matters.

import { differenceInCalendarDays, addDays, startOfDay } from 'date-fns'

export type TimelineZoom = 'day' | 'week' | 'month'

/** Column width in px per zoom. day = roomy, week = medium, month = tight. */
export const COL_WIDTH: Record<TimelineZoom, number> = {
  day: 48,
  week: 20,
  month: 8,
}

const MS_PER_DAY = 86_400_000

/**
 * 0-based calendar-day index of `date` relative to `rangeStart` (time-of-day
 * ignored — callers add the intra-day fraction for the "now" line themselves).
 * `date` before `rangeStart` -> negative. Not zoom-dependent; `zoom` is accepted
 * for signature symmetry and is asserted day-index-invariant by the test.
 */
export function columnForDate(
  date: Date,
  rangeStart: Date,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  zoom?: TimelineZoom,
): number {
  return differenceInCalendarDays(date, rangeStart)
}

/**
 * Inverse of `columnForDate` for a pixel offset into the grid body. `px` is
 * measured from the grid's left edge (day 0). Returns the start of the day
 * `floor(px / colWidth)` days after `rangeStart`, plus the fractional remainder
 * of the day as time. Round-trips: for `n >= 0`,
 * `columnForDate(dateForOffset(n * colWidth, rangeStart, zoom, colWidth), rangeStart) === n`.
 */
export function dateForOffset(
  px: number,
  rangeStart: Date,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  zoom: TimelineZoom,
  colWidth: number,
): Date {
  const days = Math.floor(px / colWidth)
  const frac = (px - days * colWidth) / colWidth
  const base = addDays(startOfDay(rangeStart), days)
  return new Date(base.getTime() + frac * MS_PER_DAY)
}

/** Fraction of the day elapsed at `date` (0 at midnight, 0.5 at noon) — the
 *  intra-day offset for the "now" line. */
export function fractionOfDay(date: Date): number {
  return (date.getTime() - startOfDay(date).getTime()) / MS_PER_DAY
}
