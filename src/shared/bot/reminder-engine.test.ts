import { describe, it, expect } from 'vitest'
import { backoffDelayMs, rollRecurrence, reaperCutoff, MAX_ATTEMPTS } from './reminder-engine'
import type { Reminder } from '@/shared/types/productivity'

type RollArg = Pick<Reminder, 'recurrence' | 'remindAt'>
const stamp = (iso: string) => ({ toDate: () => new Date(iso) })
const arg = (recurrence: unknown, remindAtIso: string): RollArg =>
  ({ recurrence, remindAt: stamp(remindAtIso) }) as unknown as RollArg

describe('reminder-engine', () => {
  it('backoff doubles and caps at 30m', () => {
    expect(backoffDelayMs(1)).toBe(60_000)
    expect(backoffDelayMs(3)).toBe(240_000)
    expect(backoffDelayMs(20)).toBe(1_800_000)
  })

  it('reaperCutoff is 5 minutes before now; MAX_ATTEMPTS is 5', () => {
    expect(reaperCutoff(new Date('2026-09-08T12:00:00Z')).toISOString()).toBe(
      '2026-09-08T11:55:00.000Z',
    )
    expect(MAX_ATTEMPTS).toBe(5)
  })

  it('rollRecurrence daily lands on the next occurrence after `from`', () => {
    const next = rollRecurrence(
      arg({ freq: 'daily', until: null }, '2026-09-08T00:00:00Z'),
      new Date('2026-09-09T10:00:00Z'),
    )
    expect(next?.toISOString()).toBe('2026-09-10T00:00:00.000Z')
  })

  it('rollRecurrence returns null past `until`', () => {
    const next = rollRecurrence(
      arg({ freq: 'daily', until: stamp('2026-09-08T12:00:00Z') }, '2026-09-08T00:00:00Z'),
      new Date('2026-09-09T00:00:00Z'),
    )
    expect(next).toBeNull()
  })

  it('non-recurring → null', () => {
    expect(rollRecurrence(arg(null, '2026-09-08T00:00:00Z'), new Date())).toBeNull()
  })
})
