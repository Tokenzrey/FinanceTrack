import { describe, expect, it } from 'vitest'
import { dayKeyInTz, formatDateTime, formatDayLong } from './format'

// 2026-09-06T07:32:00Z = 14.32 WIB pada hari Minggu.
const T = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))

describe('formatDateTime', () => {
  it('renders the Jakarta wall clock with a WIB label, not the server UTC clock', () => {
    expect(formatDateTime(T)).toBe('Min, 6 Sep 2026 · 14.32 WIB')
  })

  it('honours a non-default Indonesian timezone', () => {
    expect(formatDateTime(T, 'Asia/Jayapura')).toBe('Min, 6 Sep 2026 · 16.32 WIT')
  })

  it('omits the label for a timezone outside Indonesia', () => {
    expect(formatDateTime(T, 'UTC')).toBe('Min, 6 Sep 2026 · 07.32')
  })
})

describe('formatDayLong', () => {
  it('spells the weekday and month out in full', () => {
    expect(formatDayLong(T)).toBe('Minggu, 6 September 2026')
  })
})

describe('dayKeyInTz', () => {
  it('rolls the day over at local midnight, not UTC midnight', () => {
    // 2026-09-06T17:30:00Z is already 2026-09-07 in Jakarta (UTC+7).
    const late = new Date(Date.UTC(2026, 8, 6, 17, 30, 0))
    expect(dayKeyInTz(late)).toBe('2026-09-07')
    expect(dayKeyInTz(late, 'UTC')).toBe('2026-09-06')
  })
})
