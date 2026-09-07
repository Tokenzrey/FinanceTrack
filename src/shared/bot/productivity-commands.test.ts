import { describe, it, expect } from 'vitest'
import { parseProductivityCommand, parseProductivityToken } from './productivity-commands'

const TZ = 'Asia/Jakarta'
const now = new Date('2026-09-08T02:00:00.000Z')

describe('parseProductivityCommand', () => {
  it('/task with title + when + priority', () => {
    const c = parseProductivityCommand('/task Review PRD besok jam 3 sore !high', now, TZ)
    expect(c.kind).toBe('task_add')
    if (c.kind !== 'task_add') return
    expect(c.title).toBe('Review PRD')
    expect(c.priority).toBe('high')
    expect(c.when?.at.toISOString()).toBe('2026-09-09T08:00:00.000Z')
  })

  it('bare /tugas → task_list open', () => {
    expect(parseProductivityCommand('/tugas', now, TZ)).toEqual({ kind: 'task_list', filter: 'open' })
  })

  it('/selesai 3 → task_done ref 3', () => {
    expect(parseProductivityCommand('/selesai 3', now, TZ)).toEqual({ kind: 'task_done', ref: 3 })
  })

  it('/note cari webhook → note_search', () => {
    expect(parseProductivityCommand('/note cari webhook', now, TZ)).toEqual({ kind: 'note_search', keyword: 'webhook' })
  })

  it('/catat free text → note_add', () => {
    expect(parseProductivityCommand('/catat pakai ticker go buat cron', now, TZ))
      .toEqual({ kind: 'note_add', text: 'pakai ticker go buat cron' })
  })

  it('/ingatkan without a parseable time → none', () => {
    expect(parseProductivityCommand('/ingatkan sesuatu', now, TZ)).toEqual({ kind: 'none' })
  })

  it('not a productivity command → none', () => {
    expect(parseProductivityCommand('kopi 25rb', now, TZ)).toEqual({ kind: 'none' })
  })
})

describe('parseProductivityToken', () => {
  it('pr:snooze:<id>:15', () => {
    expect(parseProductivityToken('pr:snooze:abc123:15'))
      .toEqual({ kind: 'snooze', ref: null, minutes: 15 })
  })
  it('pr:done:<id>', () => {
    expect(parseProductivityToken('pr:done:abc123'))
      .toEqual({ kind: 'mark_done_token', reminderId: 'abc123' })
  })
})
