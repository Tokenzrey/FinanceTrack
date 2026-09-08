import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { Note, Reminder, Task } from '@/shared/types/productivity'
import { formatDateTime } from '@/shared/lib/format'
import {
  agenda,
  digest,
  noRecentReminder,
  noteList,
  noteSaved,
  noteSearchResult,
  planFallbackError,
  reminderGone,
  reminderMarkedDone,
  reminderNeedsTime,
  reminderPush,
  reminderSet,
  snoozed,
  taskCreated,
  taskDone,
  taskList,
  taskRefNotFound,
  taskRemoved,
} from './replies-productivity'

const TZ = 'Asia/Jakarta'
const ts = (iso: string) => Timestamp.fromDate(new Date(iso)) as unknown as Task['createdAt']

const mkTask = (o: Partial<Task>): Task =>
  ({
    id: 't1',
    title: 'Tugas',
    notes: null,
    status: 'todo',
    priority: 'med',
    dueAt: null,
    doneAt: null,
    source: 'web',
    createdAt: ts('2026-09-01T00:00:00Z'),
    updatedAt: ts('2026-09-01T00:00:00Z'),
    ...o,
  }) as Task

const mkReminder = (o: Partial<Reminder>): Reminder =>
  ({
    id: 'r1',
    ownerId: 'u1',
    kind: 'standalone',
    taskId: null,
    message: 'bayar listrik',
    remindAt: ts('2026-09-08T02:00:00Z'),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    recurrence: null,
    source: 'whatsapp',
    createdAt: ts('2026-09-01T00:00:00Z'),
    updatedAt: ts('2026-09-01T00:00:00Z'),
    ...o,
  }) as Reminder

// ─── Brief Step 1 (verbatim) ──────────────────────────────────

it('taskList numbers items and marks priority', () => {
  const r = taskList(
    [{ id: 'a', title: 'Review PRD', status: 'todo', priority: 'high', dueAt: null } as unknown as Task],
    'open',
    TZ,
  )
  expect(r.text).toMatch(/1\..*Review PRD/)
  expect(r.text).toMatch(/‼️|🔴|!/)
})

it('reminderPush returns three action buttons with pr: tokens', () => {
  const { buttons } = reminderPush(
    mkReminder({ id: 'x1', message: '⏰ bayar listrik' }),
    TZ,
  )
  expect(buttons.map((b) => b.token)).toEqual(['pr:done:x1', 'pr:snooze:x1:15', 'pr:snooze:x1:60'])
})

it('reminderPush leads with a bold title line and shows its own time', () => {
  const at = '2026-09-08T13:00:00Z'
  const { text, buttons } = reminderPush(mkReminder({ id: 'x1', remindAt: ts(at) }), TZ)
  expect(text.split('\n')[0]).toBe('⏰ <b>Pengingat</b>')
  expect(text).toContain(`🗓 ${formatDateTime(new Date(at), TZ)}`)
  expect(buttons.map((b) => b.token)).toEqual(['pr:done:x1', 'pr:snooze:x1:15', 'pr:snooze:x1:60'])
})

it('agenda shows an empty-state line when nothing is due', () => {
  const r = agenda([], [], TZ, 'Selasa, 8 September 2026')
  expect(r.text).toMatch(/tidak ada|kosong|santai/i)
})

// ─── Extra behavioural assertions ─────────────────────────────

describe('replies-productivity', () => {
  it('every BotReply sets html: true', () => {
    expect(taskDone(mkTask({})).html).toBe(true)
    expect(taskRemoved('x').html).toBe(true)
    expect(taskRefNotFound(3).html).toBe(true)
    expect(reminderNeedsTime().html).toBe(true)
    expect(planFallbackError().html).toBe(true)
    expect(noteList([]).html).toBe(true)
  })

  it('taskDone names the task with a ✅', () => {
    const r = taskDone(mkTask({ title: 'Kirim laporan' }))
    expect(r.text).toContain('Kirim laporan')
    expect(r.text).toContain('✅')
  })

  it('taskList numbers multiple items in order', () => {
    const r = taskList(
      [mkTask({ id: 'a', title: 'Satu' }), mkTask({ id: 'b', title: 'Dua' })],
      'all',
      TZ,
    )
    expect(r.text).toMatch(/1\..*Satu/)
    expect(r.text).toMatch(/2\..*Dua/)
  })

  it('taskCreated echoes the title and, when given, the reminder time', () => {
    const at = new Date('2026-09-08T01:00:00Z')
    const r = taskCreated(mkTask({ title: 'Bikin slide' }), TZ, at)
    expect(r.text).toContain('Bikin slide')
    expect(r.text).toContain(formatDateTime(at, TZ))
  })

  it('taskCreated names the column and labels when a context is given', () => {
    const r = taskCreated(mkTask({ id: 't1', listId: 'l1', labelIds: ['a', 'b'] }), TZ, null, {
      columnName: 'Dikerjakan',
      labelNames: ['Urgent', 'Klien'],
    })
    expect(r.text).toContain('📁 Dikerjakan')
    expect(r.text).toContain('🏷 Urgent, Klien')
  })

  it('taskCreated with no context / no listId renders no 📁 or 🏷 line', () => {
    const r = taskCreated(mkTask({ title: 'Beli kopi' }), TZ, null)
    expect(r.text).not.toContain('📁')
    expect(r.text).not.toContain('🏷')
  })

  it('taskList shows the column name for a task with a listId + ctxById', () => {
    const items = [mkTask({ id: 't1', title: 'Review PRD', listId: 'l1' })]
    const ctxById = new Map([['t1', { columnName: 'Dikerjakan', labelNames: ['Urgent', 'Klien'] }]])
    const r = taskList(items, 'open', TZ, ctxById)
    expect(r.text).toContain('Dikerjakan')
    expect(r.text).toContain('📁')
    expect(r.text).toContain('Urgent, Klien')
    expect(r.text).toContain('🏷')
  })

  it('taskList without ctxById is unchanged from today (no 📁 line)', () => {
    const r = taskList([mkTask({ id: 't1', title: 'Review PRD' })], 'open', TZ)
    expect(r.text).not.toContain('📁')
  })

  it('reminderSet shows the formatted remind time', () => {
    const r = reminderSet(mkReminder({ remindAt: ts('2026-09-08T02:00:00Z') }), TZ)
    expect(r.text).toContain(formatDateTime(new Date('2026-09-08T02:00:00Z'), TZ))
  })

  it('reminderSet notes recurrence when the reminder repeats', () => {
    const r = reminderSet(mkReminder({ recurrence: { freq: 'daily', until: null } }), TZ)
    expect(r.text).toMatch(/berulang/i)
  })

  it('reminderNeedsTime gives a concrete example', () => {
    expect(reminderNeedsTime().text).toMatch(/Kapan mau diingatkan/i)
    expect(reminderNeedsTime().text).toContain('/ingatkan')
  })

  it('reminderPush body carries the reminder message and recurrence hint', () => {
    const plain = reminderPush(mkReminder({ message: 'minum obat' }), TZ)
    expect(plain.text).toContain('minum obat')
    const repeating = reminderPush(mkReminder({ recurrence: { freq: 'weekday', until: null } }), TZ)
    expect(repeating.text).toMatch(/berulang/i)
  })

  it('digest counts tasks and reminders explicitly', () => {
    const r = digest('Sari', [mkTask({ id: 'a' }), mkTask({ id: 'b' })], [mkReminder({})], TZ)
    expect(r.text).toContain('2 tugas')
    expect(r.text).toContain('1 pengingat')
    expect(r.text).toContain('Sari')
  })

  it('digest is friendly when the day is clear', () => {
    const r = digest(null, [], [], TZ)
    expect(r.text).toMatch(/tidak ada|kosong|santai/i)
  })

  it('agenda lists tasks and reminders when there are any', () => {
    const r = agenda(
      [mkTask({ title: 'Rapat tim' })],
      [mkReminder({ message: 'telepon klien' })],
      TZ,
      'Selasa, 8 September 2026',
    )
    expect(r.text).toContain('Rapat tim')
    expect(r.text).toContain('telepon klien')
    expect(r.text).toContain('Selasa, 8 September 2026')
  })

  it('snoozed confirms the new time', () => {
    const r = snoozed(mkReminder({ remindAt: ts('2026-09-08T03:15:00Z') }), TZ)
    expect(r.text).toContain(formatDateTime(new Date('2026-09-08T03:15:00Z'), TZ))
  })

  it('noteSaved shows the title and tags', () => {
    const n = {
      id: 'n1',
      title: 'Ide produk',
      content: 'bikin fitur baru',
      tags: ['produk', 'q4'],
    } as unknown as Note
    const r = noteSaved(n)
    expect(r.text).toContain('Ide produk')
    expect(r.text).toContain('produk')
  })

  it('noteSearchResult has an empty state naming the keyword', () => {
    const r = noteSearchResult('roadmap', [])
    expect(r.text).toContain('roadmap')
    expect(r.text).toMatch(/tidak ada|kosong/i)
  })

  it('noteList numbers notes and has an empty state', () => {
    expect(noteList([]).text).toMatch(/tidak ada|kosong/i)
    const r = noteList([
      { id: 'n1', title: 'Alpha', content: 'a', tags: [] } as unknown as Note,
      { id: 'n2', title: 'Beta', content: 'b', tags: [] } as unknown as Note,
    ])
    expect(r.text).toMatch(/1\..*Alpha/)
    expect(r.text).toMatch(/2\..*Beta/)
  })

  it('escapes HTML in user-supplied text', () => {
    const r = taskRemoved('<script>')
    expect(r.text).not.toContain('<script>')
    expect(r.text).toContain('&lt;script&gt;')
  })

  it('taskRefNotFound mentions the bad reference number', () => {
    expect(taskRefNotFound(7).text).toContain('7')
  })

  it('snooze/mark-done fallbacks are non-empty Bahasa Indonesia lines', () => {
    expect(noRecentReminder().text).toMatch(/pengingat/i)
    expect(reminderGone().text).toMatch(/tidak ada/i)
    expect(reminderMarkedDone().text).toMatch(/selesai/i)
  })
})
