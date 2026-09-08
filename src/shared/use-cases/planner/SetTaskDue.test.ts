import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'

const updateTask = vi.fn()
const createReminder = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    tasks: { update: (...args: unknown[]) => updateTask(...args) },
    reminders: { create: (...args: unknown[]) => createReminder(...args) },
  },
}))

const { setTaskDue } = await import('./SetTaskDue.usecase')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'))
  updateTask.mockReset().mockResolvedValue(undefined)
  createReminder.mockReset().mockResolvedValue({ id: 'rem-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setTaskDue', () => {
  it('clears the due date without creating reminders', async () => {
    await setTaskDue('u1', 't1', 'Beli susu', null, [60])
    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { dueAt: null })
    expect(createReminder).not.toHaveBeenCalled()
  })

  it('sets the due date and creates a lead reminder at due minus lead', async () => {
    const dueAt = new Date('2026-09-10T08:00:00Z')
    await setTaskDue('u1', 't1', 'Beli susu', dueAt, [60])

    expect(updateTask).toHaveBeenCalledWith('u1', 't1', { dueAt })
    expect(createReminder).toHaveBeenCalledWith('u1', {
      message: `⏰ Tugas: Beli susu — jatuh tempo ${formatDateTime(dueAt, DEFAULT_TZ)}`,
      remindAt: new Date('2026-09-10T07:00:00Z'),
      source: 'web',
      taskId: 't1',
    })
  })

  it('skips a lead whose reminder time is already in the past', async () => {
    const dueAt = new Date('2026-09-08T00:30:00Z') // 30 min from the frozen "now"
    await setTaskDue('u1', 't1', 'Beli susu', dueAt, [60, 15])

    expect(createReminder).toHaveBeenCalledTimes(1)
    expect(createReminder).toHaveBeenCalledWith('u1', {
      message: `⏰ Tugas: Beli susu — jatuh tempo ${formatDateTime(dueAt, DEFAULT_TZ)}`,
      remindAt: new Date('2026-09-08T00:15:00Z'),
      source: 'web',
      taskId: 't1',
    })
  })
})
