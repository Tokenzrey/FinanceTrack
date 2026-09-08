import { describe, expect, it } from 'vitest'
import { addDays } from 'date-fns'

import {
  EXTEND_DAYS,
  MAX_RANGE_DAYS,
  extendRange,
  initialRange,
  stepZoom,
  type TimelineRange,
} from './timeline-range'

const d = (iso: string) => new Date(iso)

describe('initialRange', () => {
  const today = d('2026-09-09T10:00:00')

  it('spans a zoom-appropriate window around today when there are no tasks', () => {
    const day = initialRange('day', today, [])
    const month = initialRange('month', today, [])
    // A tighter column needs more days on screen to fill the same width.
    expect(month.dayCount).toBeGreaterThan(day.dayCount)
    // Today is inside every window.
    expect(day.start.getTime()).toBeLessThanOrEqual(today.getTime())
    expect(addDays(day.start, day.dayCount).getTime()).toBeGreaterThan(today.getTime())
  })

  it('grows to contain every task span, however far out', () => {
    const far = d('2027-06-01T00:00:00')
    const r = initialRange('week', today, [{ min: d('2026-01-05T00:00:00'), max: far }])
    expect(r.start.getTime()).toBeLessThanOrEqual(d('2026-01-05T00:00:00').getTime())
    expect(addDays(r.start, r.dayCount).getTime()).toBeGreaterThanOrEqual(far.getTime())
  })

  it('starts on a Monday so the week ruler aligns', () => {
    expect(initialRange('week', today, []).start.getDay()).toBe(1)
  })
})

describe('extendRange', () => {
  const base: TimelineRange = { start: d('2026-09-07T00:00:00'), dayCount: 84 }

  it('extends forward by keeping the start and growing the count', () => {
    const next = extendRange(base, 'end')
    expect(next.start.getTime()).toBe(base.start.getTime())
    expect(next.dayCount).toBe(base.dayCount + EXTEND_DAYS)
  })

  it('extends backward by moving the start earlier and growing the count', () => {
    const next = extendRange(base, 'start')
    expect(next.dayCount).toBe(base.dayCount + EXTEND_DAYS)
    // The window grew on the left, so the same instants keep their positions
    // only if the caller compensates scrollLeft — the reducer reports the shift.
    expect(next.start.getTime()).toBe(addDays(base.start, -EXTEND_DAYS).getTime())
  })

  it('stops growing at the cap so a runaway scroll cannot allocate forever', () => {
    const huge: TimelineRange = { start: base.start, dayCount: MAX_RANGE_DAYS }
    expect(extendRange(huge, 'end')).toBe(huge)
    expect(extendRange(huge, 'start')).toBe(huge)
  })

  it('clamps a partial extension to land exactly on the cap', () => {
    const near: TimelineRange = { start: base.start, dayCount: MAX_RANGE_DAYS - 10 }
    expect(extendRange(near, 'end').dayCount).toBe(MAX_RANGE_DAYS)
  })
})

describe('stepZoom', () => {
  it('steps toward finer columns and clamps at day', () => {
    expect(stepZoom('month', 1)).toBe('week')
    expect(stepZoom('week', 1)).toBe('day')
    expect(stepZoom('day', 1)).toBe('day')
  })

  it('steps toward coarser columns and clamps at month', () => {
    expect(stepZoom('day', -1)).toBe('week')
    expect(stepZoom('week', -1)).toBe('month')
    expect(stepZoom('month', -1)).toBe('month')
  })
})
