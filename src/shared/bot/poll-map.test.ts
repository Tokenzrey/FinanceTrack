import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

const getAdminDb = vi.fn()
vi.mock('@/shared/lib/firebase-admin', () => ({ getAdminDb: () => getAdminDb() }))

const { rememberPoll, resolvePollVote } = await import('./poll-map')

/** One in-memory doc keyed by id, served through the chain `poll-map.ts` uses. */
function fakeDb() {
  const store = new Map<string, Record<string, unknown>>()
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => {
          store.set(`${name}/${id}`, data)
        },
        get: async () => {
          const data = store.get(`${name}/${id}`)
          return { exists: !!data, data: () => data }
        },
      }),
    }),
  }
  return { db, store }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('poll map', () => {
  it('round-trips a vote label back to its command token', async () => {
    const { db } = fakeDb()
    getAdminDb.mockReturnValue(db)

    await rememberPoll('poll-1', [
      { label: '✅ Selesai', token: 'pr:done:r9' },
      { label: '😴 +15 mnt', token: 'pr:snooze:r9:15' },
    ])

    expect(await resolvePollVote('poll-1', '😴 +15 mnt')).toBe('pr:snooze:r9:15')
    expect(await resolvePollVote('poll-1', '✅ Selesai')).toBe('pr:done:r9')
  })

  it('returns null for an unknown poll, an unknown label, or a blank id', async () => {
    const { db } = fakeDb()
    getAdminDb.mockReturnValue(db)
    await rememberPoll('poll-1', [{ label: 'A', token: 't:a' }])

    expect(await resolvePollVote('missing', 'A')).toBeNull()
    expect(await resolvePollVote('poll-1', 'not an option')).toBeNull()
    expect(await resolvePollVote('', 'A')).toBeNull()
  })

  it('treats an expired map as gone', async () => {
    const { db, store } = fakeDb()
    getAdminDb.mockReturnValue(db)
    await rememberPoll('poll-1', [{ label: 'A', token: 't:a' }])

    // Backdate the expiry past now.
    const doc = store.get('bot_poll_map/poll-1')!
    doc.expiresAt = Timestamp.fromMillis(Date.now() - 1000)

    expect(await resolvePollVote('poll-1', 'A')).toBeNull()
  })
})
