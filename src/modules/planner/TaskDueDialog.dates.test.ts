import { describe, expect, it } from 'vitest'
import { datetimeLocalToUtc, toDatetimeLocal } from './PlannerPage'

// The datetime-local input holds a wall-clock string in the user's profile zone,
// not the browser's. These two helpers must be exact inverses in that zone.

describe('TaskDueDialog date helpers', () => {
  it('formats a UTC instant as wall-clock in Asia/Jakarta (UTC+7)', () => {
    // 2026-09-10T08:00Z === 15:00 in Jakarta
    expect(toDatetimeLocal(new Date('2026-09-10T08:00:00Z'), 'Asia/Jakarta')).toBe(
      '2026-09-10T15:00',
    )
  })

  it('formats a UTC instant as wall-clock in Asia/Jayapura (UTC+9)', () => {
    expect(toDatetimeLocal(new Date('2026-09-10T08:00:00Z'), 'Asia/Jayapura')).toBe(
      '2026-09-10T17:00',
    )
  })

  it('parses a wall-clock string back to the right UTC instant per zone', () => {
    expect(datetimeLocalToUtc('2026-09-10T15:00', 'Asia/Jakarta').toISOString()).toBe(
      '2026-09-10T08:00:00.000Z',
    )
    expect(datetimeLocalToUtc('2026-09-10T17:00', 'Asia/Jayapura').toISOString()).toBe(
      '2026-09-10T08:00:00.000Z',
    )
  })

  it('round-trips instant → string → instant', () => {
    for (const tz of ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']) {
      const instant = new Date('2026-12-31T20:30:00Z')
      expect(datetimeLocalToUtc(toDatetimeLocal(instant, tz), tz).getTime()).toBe(instant.getTime())
    }
  })
})
