import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancel = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    reminders: { cancel: (...args: unknown[]) => cancel(...args) },
  },
}))

const { cancelReminder } = await import('./CancelReminder.usecase')

beforeEach(() => {
  cancel.mockReset().mockResolvedValue(undefined)
})

describe('cancelReminder', () => {
  it('delegates to the reminder repo cancel', async () => {
    await cancelReminder('u1', 'rem-9')
    expect(cancel).toHaveBeenCalledWith('u1', 'rem-9')
  })

  it('propagates a repo failure to the caller', async () => {
    cancel.mockRejectedValue(new Error('Firestore offline'))
    await expect(cancelReminder('u1', 'rem-9')).rejects.toThrow('Firestore offline')
  })
})
