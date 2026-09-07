import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Reminder } from '@/shared/types/productivity'

const SECRET = 's3cr3t-of-correct-length-000000'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PRODUCTIVITY_CRON_SECRET = SECRET
})

vi.mock('@/shared/bot/admin-data-productivity', () => ({
  reapStuckSending: vi.fn(async () => 0),
  dueRemindersPage: vi.fn(async () => [{ ref: { id: 'r1' }, data: {} }]),
  claimReminder: vi.fn(async () => ({
    id: 'r1',
    ownerId: 'u1',
    message: 'hai',
    attempts: 1,
    recurrence: null,
    kind: 'standalone',
    taskId: null,
  })),
  markReminderSent: vi.fn(async () => {}),
  markReminderFailed: vi.fn(async () => {}),
  createReminder: vi.fn(async () => ({})),
  recordCronRun: vi.fn(async () => {}),
  setPlannerLastPush: vi.fn(async () => {}),
}))
vi.mock('@/shared/bot/outbound', () => ({
  sendToUser: vi.fn(async () => ({ ok: true, sent: 1 })),
}))

import { POST } from './route'
import * as data from '@/shared/bot/admin-data-productivity'
import { sendToUser } from '@/shared/bot/outbound'

const authed = () =>
  new Request('http://x/api/cron/reminders', {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRET}` },
  })

describe('POST /api/cron/reminders', () => {
  it('401 without the bearer secret', async () => {
    const res = await POST(new Request('http://x/api/cron/reminders', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('claims and sends a due reminder with the secret', async () => {
    const res = await POST(authed())
    expect(await res.json()).toMatchObject({ ok: true, sent: 1, failed: 0 })
    expect(sendToUser).toHaveBeenCalled()
    expect(data.markReminderSent).toHaveBeenCalled()
  })

  it('invokes the reaper with a ~5-minute-old cutoff', async () => {
    const before = Date.now()
    await POST(authed())
    expect(data.reapStuckSending).toHaveBeenCalledTimes(1)
    const cutoff = vi.mocked(data.reapStuckSending).mock.calls[0][0] as Date
    const delta = before - cutoff.getTime()
    expect(delta).toBeGreaterThanOrEqual(5 * 60_000 - 2000)
    expect(delta).toBeLessThanOrEqual(5 * 60_000 + 2000)
  })

  it('records the last pushed reminder after a successful send', async () => {
    await POST(authed())
    expect(data.setPlannerLastPush).toHaveBeenCalledWith('u1', 'r1')
  })

  it('rolls a recurring reminder forward via createReminder', async () => {
    vi.mocked(data.claimReminder).mockResolvedValueOnce({
      id: 'r2',
      ownerId: 'u1',
      message: 'standup',
      attempts: 0,
      kind: 'standalone',
      taskId: null,
      recurrence: { freq: 'daily', until: null },
      remindAt: { toDate: () => new Date('2026-01-01T00:00:00Z') },
    } as unknown as Reminder)

    await POST(authed())

    expect(data.createReminder).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ message: 'standup', source: 'auto' }),
      { kind: 'standalone', taskId: null },
    )
  })

  it('a failed send marks the reminder failed with a backoff', async () => {
    vi.mocked(sendToUser).mockResolvedValueOnce({ ok: false, sent: 0, error: 'gowa 500' })
    const res = await POST(authed())
    expect(data.markReminderFailed).toHaveBeenCalled()
    const [, err, nextAttemptAt] = vi.mocked(data.markReminderFailed).mock.calls[0]
    expect(err).toContain('gowa 500')
    expect(nextAttemptAt).toBeInstanceOf(Date)
    expect((await res.json()).failed).toBe(1)
  })
})
