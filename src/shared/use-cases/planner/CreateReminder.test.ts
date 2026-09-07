import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createReminder_ = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    reminders: { create: (...args: unknown[]) => createReminder_(...args) },
  },
}))

const { createReminder } = await import('./CreateReminder.usecase')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'))
  createReminder_.mockReset().mockResolvedValue({ id: 'rem-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createReminder', () => {
  it('rejects a remindAt in the past', async () => {
    await expect(
      createReminder('u1', {
        message: 'bayar listrik',
        remindAt: new Date('2026-09-07T00:00:00Z'),
        source: 'web',
      }),
    ).rejects.toThrow(/masa depan/)
    expect(createReminder_).not.toHaveBeenCalled()
  })

  it('trims the message and delegates to the repo', async () => {
    const remindAt = new Date('2026-09-09T00:00:00Z')
    await createReminder('u1', { message: '  bayar listrik  ', remindAt, source: 'web' })
    expect(createReminder_).toHaveBeenCalledWith('u1', {
      message: 'bayar listrik',
      remindAt,
      source: 'web',
    })
  })
})
