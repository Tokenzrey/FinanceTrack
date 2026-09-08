import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const getIdToken = vi.fn(async () => 'tok-123')
  return { getIdToken, state: { user: { getIdToken } as { getIdToken: () => Promise<string> } | null } }
})

vi.mock('@/shared/lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: h.state.user }),
}))

const { updatePlannerPrefs } = await import('./UpdatePlannerPrefs.usecase')

const PAYLOAD = { digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0, 60] }

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { getIdToken: h.getIdToken }
  h.getIdToken.mockResolvedValue('tok-123')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('updatePlannerPrefs', () => {
  it('POSTs the payload to /api/planner/prefs with a Bearer token', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)

    await updatePlannerPrefs(PAYLOAD)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/planner/prefs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
        body: JSON.stringify(PAYLOAD),
      }),
    )
  })

  it('throws the server error message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Jam rekap harus 0–23.' }) })),
    )

    await expect(updatePlannerPrefs({ ...PAYLOAD, digestHour: 99 })).rejects.toThrow(
      'Jam rekap harus 0–23.',
    )
  })

  it('throws when signed out, without calling fetch', async () => {
    h.state.user = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(updatePlannerPrefs(PAYLOAD)).rejects.toThrow('Belum masuk.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
