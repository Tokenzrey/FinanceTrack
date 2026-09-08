import { describe, it, expect } from 'vitest'

import { COL_WIDTH, columnForDate, dateForOffset, fractionOfDay } from './timeline-scale'

const d = (iso: string) => new Date(iso)

describe('timeline-scale', () => {
  describe('columnForDate', () => {
    const rangeStart = d('2026-03-01T00:00:00')

    it('is 0 for rangeStart itself', () => {
      expect(columnForDate(d('2026-03-01T00:00:00'), rangeStart)).toBe(0)
    })

    it('counts calendar days within a month', () => {
      expect(columnForDate(d('2026-03-15T00:00:00'), rangeStart)).toBe(14)
    })

    it('crosses a month boundary (March has 31 days)', () => {
      // Apr 1 = day 31, Apr 2 = day 32.
      expect(columnForDate(d('2026-04-02T00:00:00'), d('2026-03-01T00:00:00'))).toBe(32)
    })

    it('is negative for a date before rangeStart', () => {
      expect(columnForDate(d('2026-02-27T00:00:00'), d('2026-03-01T00:00:00'))).toBe(-2)
    })

    it('ignores time-of-day (calendar-day based)', () => {
      expect(columnForDate(d('2026-03-15T23:59:00'), rangeStart)).toBe(14)
    })

    it('is day-index-invariant across all three zooms', () => {
      const date = d('2026-04-02T09:00:00')
      const start = d('2026-03-01T00:00:00')
      expect(columnForDate(date, start, 'day')).toBe(32)
      expect(columnForDate(date, start, 'week')).toBe(32)
      expect(columnForDate(date, start, 'month')).toBe(32)
    })
  })

  describe('dateForOffset', () => {
    const rangeStart = d('2026-03-01T00:00:00')

    it('round-trips with columnForDate for n >= 0 at every zoom', () => {
      for (const zoom of ['day', 'week', 'month'] as const) {
        const colWidth = COL_WIDTH[zoom]
        for (const n of [0, 1, 14, 32, 90]) {
          const back = dateForOffset(n * colWidth, rangeStart, zoom, colWidth)
          expect(columnForDate(back, rangeStart)).toBe(n)
        }
      }
    })

    it('resolves a half-column offset to midday of that day', () => {
      const colWidth = COL_WIDTH.day
      const mid = dateForOffset(colWidth * 2.5, rangeStart, 'day', colWidth)
      expect(columnForDate(mid, rangeStart)).toBe(2)
      expect(mid.getHours()).toBe(12)
    })

    it('round-trips across a month boundary', () => {
      const colWidth = COL_WIDTH.week
      // Offset landing on Apr 2 (day 32).
      const back = dateForOffset(32 * colWidth, rangeStart, 'week', colWidth)
      expect(columnForDate(back, rangeStart)).toBe(32)
      expect(back.getMonth()).toBe(3) // April
      expect(back.getDate()).toBe(2)
    })
  })

  describe('fractionOfDay', () => {
    it('is 0 at midnight, ~0.5 at noon', () => {
      expect(fractionOfDay(d('2026-03-01T00:00:00'))).toBe(0)
      expect(fractionOfDay(d('2026-03-01T12:00:00'))).toBeCloseTo(0.5, 5)
    })
  })
})
