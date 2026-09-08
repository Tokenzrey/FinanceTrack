import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/lib/verify-firebase-token', () => ({
  verifyFirebaseIdToken: vi.fn(async () => ({ uid: 'u1' })),
}))
vi.mock('@/shared/bot/admin-data-productivity', () => ({
  setPlannerPrefs: vi.fn(async () => {}),
  upsertDigestRoster: vi.fn(async () => {}),
}))
vi.mock('@/shared/bot/admin-data', () => ({
  getUserTimezone: vi.fn(async () => 'Asia/Jakarta'),
}))

import { POST } from './route'
import { verifyFirebaseIdToken } from '@/shared/lib/verify-firebase-token'
import { setPlannerPrefs, upsertDigestRoster } from '@/shared/bot/admin-data-productivity'

type Body = Record<string, unknown>

const req = (body: Body, headers: Record<string, string> = { Authorization: 'Bearer tok' }) =>
  new Request('http://x/api/planner/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/planner/prefs', () => {
  it('401 without an Authorization header', async () => {
    const res = await POST(req({ digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0] }, {}))
    expect(res.status).toBe(401)
    expect(setPlannerPrefs).not.toHaveBeenCalled()
  })

  it('401 when the token fails verification', async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error('bad token'))
    const res = await POST(req({ digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0] }))
    expect(res.status).toBe(401)
  })

  it('persists prefs and adds the roster line when the digest is enabled', async () => {
    const res = await POST(req({ digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0, 60] }))
    expect(res.status).toBe(200)
    expect(setPlannerPrefs).toHaveBeenCalledWith('u1', {
      digestHour: 6,
      digestEnabled: true,
      taskLeadsMinutes: [0, 60],
    })
    expect(upsertDigestRoster).toHaveBeenCalledWith('u1', { tz: 'Asia/Jakarta', digestHour: 6 })
  })

  it('removes the roster line and normalises empty leads to [0] when the digest is off', async () => {
    const res = await POST(req({ digestHour: 6, digestEnabled: false, taskLeadsMinutes: [] }))
    expect(res.status).toBe(200)
    expect(upsertDigestRoster).toHaveBeenCalledWith('u1', null)
    expect(setPlannerPrefs).toHaveBeenCalledWith('u1', {
      digestHour: 6,
      digestEnabled: false,
      taskLeadsMinutes: [0],
    })
  })

  it('400 when digestHour is out of range', async () => {
    const res = await POST(req({ digestHour: 99, digestEnabled: true, taskLeadsMinutes: [0] }))
    expect(res.status).toBe(400)
    expect(setPlannerPrefs).not.toHaveBeenCalled()
  })
})
