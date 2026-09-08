import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import { DueChip } from './DueChip'
import { PriorityDot } from './PriorityDot'

const TZ = 'Asia/Jakarta'
// Frozen "now": 2026-09-08 12:00 WIB (05:00 UTC).
const NOW = new Date('2026-09-08T05:00:00Z')
const ts = (iso: string) => Timestamp.fromDate(new Date(iso))

describe('DueChip', () => {
  it('renders nothing when dueAt is null', () => {
    const { container } = render(<DueChip dueAt={null} tz={TZ} now={NOW} />)
    expect(container.firstChild).toBeNull()
  })

  it('says "Terlambat 2 hari" for a due date 2 calendar days in the past', () => {
    // 2026-09-06 09:00 WIB
    const { container } = render(<DueChip dueAt={ts('2026-09-06T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/Terlambat 2 hari/)
  })

  it('says "Hari ini 14.00" for a due today at 14:00 WIB', () => {
    // 2026-09-08 14:00 WIB = 07:00 UTC
    const { container } = render(<DueChip dueAt={ts('2026-09-08T07:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/Hari ini 14\.00/)
  })

  it('says "Besok" for a due date tomorrow', () => {
    // 2026-09-09 09:00 WIB
    const { container } = render(<DueChip dueAt={ts('2026-09-09T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/Besok/)
  })

  it('uses a short Indonesian weekday for 2-7 days ahead', () => {
    // 2026-09-11 (Fri) 09:00 WIB — 3 days ahead
    const { container } = render(<DueChip dueAt={ts('2026-09-11T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/Jum 09\.00/)
  })

  it('uses an absolute date (not a weekday word) for 10 days ahead', () => {
    // 2026-09-18 09:00 WIB
    const { container } = render(<DueChip dueAt={ts('2026-09-18T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/\d{1,2} \w{3}/)
    expect(container.textContent).not.toMatch(/Sen|Sel|Rab|Kam|Jum|Sab|Min/)
    expect(container.textContent).not.toMatch(/Besok|Hari ini|Terlambat/)
  })

  it('uses an absolute date for more than 7 days in the past', () => {
    // 2026-08-20 09:00 WIB
    const { container } = render(<DueChip dueAt={ts('2026-08-20T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.textContent).toMatch(/\d{1,2} \w{3}/)
    expect(container.textContent).not.toMatch(/Terlambat/)
  })

  it('marks an overdue chip with the destructive colour', () => {
    const { container } = render(<DueChip dueAt={ts('2026-09-06T02:00:00Z')} tz={TZ} now={NOW} />)
    expect(container.querySelector('.text-destructive')).not.toBeNull()
  })
})

describe('PriorityDot', () => {
  it('renders nothing for low priority', () => {
    const { container } = render(<PriorityDot priority="low" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a destructive dot for high priority', () => {
    const { container } = render(<PriorityDot priority="high" />)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()
  })

  it('renders a muted dot for med priority', () => {
    const { container } = render(<PriorityDot priority="med" />)
    expect(container.firstChild).not.toBeNull()
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })
})
