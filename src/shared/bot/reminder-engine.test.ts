import { describe, it, expect } from 'vitest'
import { backoffDelayMs, rollRecurrence, reaperCutoff, MAX_ATTEMPTS, digestBody } from './reminder-engine'
import type { Reminder, Task } from '@/shared/types/productivity'

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

describe('digestBody', () => {
  it('summarises counts and lists titles', () => {
    const body = digestBody(
      [{ title: 'Review PRD', dueAt: null } as Task, { title: 'Kirim invoice', dueAt: null } as Task],
      [
        {
          message: 'Rapat tim',
          remindAt: { toDate: () => new Date('2026-09-08T07:00:00Z') },
        } as unknown as Reminder,
      ],
      'Asia/Jakarta',
      'Selasa, 8 September 2026',
    )
    expect(body).toMatch(/2 tugas/)
    expect(body).toMatch(/1 pengingat/)
    expect(body).toMatch(/Review PRD/)
  })

  it('empty agenda still greets and reads as an all-clear line', () => {
    const body = digestBody([], [], 'Asia/Jakarta', 'Selasa, 8 September 2026')
    expect(body).toMatch(/Selamat pagi/)
    expect(body).toMatch(/tidak ada|kosong|santai/i)
  })

  it('renders each reminder with its tz-formatted time', () => {
    const body = digestBody(
      [],
      [
        {
          message: 'Rapat tim',
          remindAt: { toDate: () => new Date('2026-09-08T07:00:00Z') },
        } as unknown as Reminder,
      ],
      'Asia/Jakarta',
      'Selasa, 8 September 2026',
    )
    expect(body).toContain('14.00')
  })

  it('escapes HTML-significant chars in dynamic values', () => {
    const body = digestBody([{ title: '<b>pwn</b>', dueAt: null } as Task], [], 'Asia/Jakarta', 'X')
    expect(body).toContain('&lt;b&gt;pwn&lt;/b&gt;')
  })
})
