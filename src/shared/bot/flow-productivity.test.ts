import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reminder } from '@/shared/types/productivity'
import { handleProductivityCommand } from './flow-productivity'
import * as data from './admin-data-productivity'

vi.mock('./admin-data', () => ({ getUserTimezone: vi.fn(async () => 'Asia/Jakarta') }))

vi.mock('./admin-data-productivity', () => ({
  createTask: vi.fn(async (_u: string, dto: { title: string; priority?: string }) => ({
    id: 't1',
    title: dto.title,
    status: 'todo',
    priority: dto.priority ?? 'med',
    dueAt: null,
  })),
  updateTask: vi.fn(async (_u: string, id: string, patch: { status?: string; dueAt?: Date }) => ({
    id,
    title: 'Review PRD',
    status: patch.status ?? 'todo',
    priority: 'high',
    dueAt: patch.dueAt ? { toDate: () => patch.dueAt } : null,
  })),
  upsertTaskReminder: vi.fn(async () => {}),
  cancelRemindersForTask: vi.fn(async () => {}),
  getPlannerPrefs: vi.fn(async () => ({ taskLeadsMinutes: [0, 60], digestHour: 7, digestEnabled: true })),
  listTasks: vi.fn(async () => []),
  listRemindersForDay: vi.fn(async () => []),
  getTaskByIndex: vi.fn(async () => null),
  deleteTask: vi.fn(async () => {}),
  createNote: vi.fn(async (_u: string, dto: { title?: string; content: string }) => ({
    id: 'n1',
    title: dto.title ?? '',
    content: dto.content,
    tags: [],
  })),
  listNotes: vi.fn(async () => []),
  searchNotes: vi.fn(async () => []),
  createReminder: vi.fn(
    async (
      _u: string,
      dto: { message: string; remindAt: Date },
      link: { kind: string; taskId: string | null },
    ) => ({
      id: 'r1',
      message: dto.message,
      kind: link.kind,
      taskId: link.taskId,
      remindAt: { toDate: () => dto.remindAt },
      recurrence: null,
    }),
  ),
  getReminderById: vi.fn(async () => null),
  getPlannerLastPush: vi.fn(async () => null),
}))

const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
const mkWhen = (at: Date) => ({ at, recurrence: null, timeWasImplicit: false })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleProductivityCommand', () => {
  it('task_add creates a task and schedules its reminder', async () => {
    const reply = await handleProductivityCommand('u1', {
      kind: 'task_add',
      title: 'Review PRD',
      when: mkWhen(future),
      priority: 'high',
    })
    expect(reply?.text).toMatch(/Review PRD/)
    expect(data.createTask).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Review PRD', priority: 'high', source: 'telegram' }),
    )
    expect(data.upsertTaskReminder).toHaveBeenCalled()
  })

  it('task_add without a due date does not schedule a reminder', async () => {
    await handleProductivityCommand('u1', {
      kind: 'task_add',
      title: 'Beli kopi',
      when: null,
      priority: null,
    })
    expect(data.upsertTaskReminder).not.toHaveBeenCalled()
  })

  it('none returns null so the dispatcher can fall through', async () => {
    expect(await handleProductivityCommand('u1', { kind: 'none' })).toBeNull()
  })

  it('task_list queries the requested filter and renders the list', async () => {
    vi.mocked(data.listTasks).mockResolvedValueOnce([
      { id: 'a', title: 'Kirim laporan', status: 'todo', priority: 'med', dueAt: null } as never,
    ])
    const reply = await handleProductivityCommand('u1', { kind: 'task_list', filter: 'open' })
    expect(data.listTasks).toHaveBeenCalledWith('u1', 'open', 'Asia/Jakarta')
    expect(reply?.text).toMatch(/Kirim laporan/)
  })

  it('task_done with an unknown ref replies taskRefNotFound', async () => {
    vi.mocked(data.getTaskByIndex).mockResolvedValueOnce(null)
    const reply = await handleProductivityCommand('u1', { kind: 'task_done', ref: 5 })
    expect(reply?.text).toContain('5')
    expect(data.updateTask).not.toHaveBeenCalled()
  })

  it('note_add derives a title from the first line and saves the note', async () => {
    const reply = await handleProductivityCommand('u1', {
      kind: 'note_add',
      text: 'Ide fitur\nrincian panjang di sini',
    })
    expect(data.createNote).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Ide fitur', content: 'Ide fitur\nrincian panjang di sini', source: 'telegram' }),
    )
    expect(reply?.text).toMatch(/Ide fitur/)
  })

  it('reminder_add creates a standalone reminder', async () => {
    const reply = await handleProductivityCommand('u1', {
      kind: 'reminder_add',
      message: 'Bayar listrik',
      when: mkWhen(future),
    })
    expect(data.createReminder).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ message: 'Bayar listrik', remindAt: future, source: 'telegram' }),
      { kind: 'standalone', taskId: null },
    )
    expect(reply?.text).toMatch(/Bayar listrik|Pengingat/)
  })

  it('snooze with a reminderId re-creates the reminder N minutes out', async () => {
    vi.mocked(data.getReminderById).mockResolvedValueOnce({
      id: 'r0',
      kind: 'standalone',
      taskId: null,
      message: 'Bayar listrik',
    } as unknown as Reminder)
    const before = Date.now()
    const reply = await handleProductivityCommand('u1', {
      kind: 'snooze',
      ref: null,
      reminderId: 'r0',
      minutes: 15,
    })
    expect(data.getReminderById).toHaveBeenCalledWith('u1', 'r0')
    const call = vi.mocked(data.createReminder).mock.calls[0]
    expect(call[1].message).toBe('Bayar listrik')
    const remindAt = call[1].remindAt as Date
    expect(remindAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000 - 1000)
    expect(reply?.text).toMatch(/diingatkan lagi/i)
  })

  it('snooze with no id and no last push replies a friendly notice', async () => {
    vi.mocked(data.getPlannerLastPush).mockResolvedValueOnce(null)
    const reply = await handleProductivityCommand('u1', {
      kind: 'snooze',
      ref: null,
      reminderId: null,
      minutes: 30,
    })
    expect(data.createReminder).not.toHaveBeenCalled()
    expect(reply?.text).toMatch(/belum ada pengingat/i)
  })

  it('mark_done_token on a task reminder marks the task done and cancels its reminders', async () => {
    vi.mocked(data.getReminderById).mockResolvedValueOnce({
      id: 'r0',
      kind: 'task',
      taskId: 't9',
      message: 'x',
    } as unknown as Reminder)
    const reply = await handleProductivityCommand('u1', {
      kind: 'mark_done_token',
      reminderId: 'r0',
    })
    expect(data.updateTask).toHaveBeenCalledWith('u1', 't9', { status: 'done' })
    expect(data.cancelRemindersForTask).toHaveBeenCalledWith('u1', 't9')
    expect(reply?.text).toMatch(/Selesai/i)
  })

  it('mark_done_token on a standalone reminder just acknowledges', async () => {
    vi.mocked(data.getReminderById).mockResolvedValueOnce({
      id: 'r0',
      kind: 'standalone',
      taskId: null,
      message: 'x',
    } as unknown as Reminder)
    const reply = await handleProductivityCommand('u1', {
      kind: 'mark_done_token',
      reminderId: 'r0',
    })
    expect(data.updateTask).not.toHaveBeenCalled()
    expect(reply?.text).toMatch(/ditandai selesai/i)
  })

  it('passes the source through to created records', async () => {
    await handleProductivityCommand(
      'u1',
      { kind: 'note_add', text: 'catatan wa' },
      'whatsapp',
    )
    expect(data.createNote).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ source: 'whatsapp' }),
    )
  })
})
