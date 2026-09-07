import { describe, it, expect, vi, beforeEach } from 'vitest'

const env = { PRODUCTIVITY_CRON_SECRET: 's3cr3t-of-correct-length-000000' }

beforeEach(() => {
  Object.assign(process.env, env)
  vi.clearAllMocks()
})

vi.mock('@/shared/bot/admin-data-productivity', () => ({
  usersDueForDigest: vi.fn(async () => [{ userId: 'u1', tz: 'Asia/Jakarta', digestHour: 7 }]),
  markDigestSent: vi.fn(async () => {}),
  listTasks: vi.fn(async () => [{ title: 'Review PRD', dueAt: null }]),
  listRemindersForDay: vi.fn(async () => []),
  recordCronRun: vi.fn(async () => {}),
}))
vi.mock('@/shared/bot/outbound', () => ({
  sendToUser: vi.fn(async () => ({ ok: true, sent: 1 })),
}))

import { POST } from './route'
import * as data from '@/shared/bot/admin-data-productivity'
import { sendToUser } from '@/shared/bot/outbound'

const authed = () =>
  new Request('http://x/api/cron/daily-digest', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PRODUCTIVITY_CRON_SECRET}` },
  })

describe('POST /api/cron/daily-digest', () => {
  it('401 without bearer', async () => {
    const res = await POST(new Request('http://x/api/cron/daily-digest', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('authed, one due user → sent: 1; sendToUser called; markDigestSent called', async () => {
    const res = await POST(authed())
    const json = await res.json()
    expect(json).toMatchObject({ sent: 1 })
    expect(sendToUser).toHaveBeenCalledTimes(1)
    expect(data.markDigestSent).toHaveBeenCalledWith('u1', expect.any(String))
  })

  it('usersDueForDigest returns empty → candidates: 0, sent: 0; sendToUser NOT called', async () => {
    vi.mocked(data.usersDueForDigest).mockResolvedValueOnce([])
    const res = await POST(authed())
    const json = await res.json()
    expect(json).toMatchObject({ candidates: 0, sent: 0 })
    expect(sendToUser).not.toHaveBeenCalled()
  })

  it('sendToUser returns ok: false → failed: 1; markDigestSent NOT called', async () => {
    vi.mocked(sendToUser).mockResolvedValueOnce({ ok: false, sent: 0 })
    const res = await POST(authed())
    const json = await res.json()
    expect(json).toMatchObject({ failed: 1 })
    expect(data.markDigestSent).not.toHaveBeenCalled()
  })
})
