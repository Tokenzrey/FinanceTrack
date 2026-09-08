import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn()
const listUpcoming = vi.fn()
const cancel = vi.fn()
const create = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    tasks: { update: (...a: unknown[]) => update(...a) },
    reminders: {
      listUpcoming: (...a: unknown[]) => listUpcoming(...a),
      cancel: (...a: unknown[]) => cancel(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}))

const { setTaskSchedule } = await import('./SetTaskSchedule.usecase')

const NOW = new Date('2026-09-08T00:00:00Z')
const TASK = { id: 't1', title: 'Tinjau', startAt: null, dueAt: null }
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  update.mockReset().mockResolvedValue(undefined)
  listUpcoming.mockReset().mockResolvedValue([])
  cancel.mockReset().mockResolvedValue(undefined)
  create.mockReset().mockResolvedValue({ id: 'rem-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setTaskSchedule', () => {
  it('writes dueAt and spawns one reminder per future lead', async () => {
    const dueAt = at(120)
    await setTaskSchedule('u1', TASK, { dueAt }, [0, 60])

    expect(update).toHaveBeenCalledWith('u1', 't1', { dueAt })
    expect(create).toHaveBeenCalledTimes(2)
    for (const call of create.mock.calls) {
      const dto = call[1] as { message: string; taskId: string; source: string }
      expect(dto.message).toContain('⏰ Tugas: Tinjau — jatuh tempo ')
      expect(dto.taskId).toBe('t1')
      expect(dto.source).toBe('web')
    }
    const times = create.mock.calls.map((c) => (c[1] as { remindAt: Date }).remindAt.getTime())
    expect(times.sort()).toEqual([at(60).getTime(), at(120).getTime()])
  })

  it('skips a lead whose fire moment has already passed and uses the start copy', async () => {
    await setTaskSchedule('u1', TASK, { startAt: at(90) }, [0, 60])

    // lead 0 → +90min (future, kept); lead 60 → +30min... also future.
    // lead 120 would be past — use it to prove the skip.
    expect(create).toHaveBeenCalledTimes(2)
    expect((create.mock.calls[0][1] as { message: string }).message).toContain(
      '▶️ Tugas: Tinjau — waktunya mulai ',
    )

    create.mockClear()
    await setTaskSchedule('u1', TASK, { startAt: at(90) }, [0, 120])
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0][1] as { remindAt: Date }).remindAt.getTime()).toBe(at(90).getTime())
  })

  it('clears the field and creates nothing when the instant is null', async () => {
    await setTaskSchedule('u1', TASK, { dueAt: null }, [0])

    expect(update).toHaveBeenCalledWith('u1', 't1', { dueAt: null })
    expect(create).not.toHaveBeenCalled()
  })

  it('cancels the task’s pending reminders before re-creating (upsert, not stacking)', async () => {
    listUpcoming.mockResolvedValue([
      { id: 'r-mine', taskId: 't1', status: 'pending' },
      { id: 'r-other-task', taskId: 't2', status: 'pending' },
      { id: 'r-failed', taskId: 't1', status: 'failed' },
      { id: 'r-standalone', taskId: null, status: 'pending' },
    ])

    await setTaskSchedule('u1', TASK, { dueAt: at(120) }, [0])

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('u1', 'r-mine')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('re-creates the untouched side from the task so a startAt-only drag keeps dueAt reminders', async () => {
    const existingDue = { toDate: () => at(300) }
    await setTaskSchedule(
      'u1',
      { ...TASK, dueAt: existingDue as never },
      { startAt: at(90) },
      [0],
    )

    expect(update).toHaveBeenCalledWith('u1', 't1', { startAt: at(90) })
    const messages = create.mock.calls.map((c) => (c[1] as { message: string }).message)
    expect(messages.some((m) => m.includes('waktunya mulai'))).toBe(true)
    expect(messages.some((m) => m.includes('jatuh tempo'))).toBe(true)
  })
})
