import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminDb = vi.fn()
vi.mock('@/shared/lib/firebase-admin', () => ({
  getAdminDb: () => getAdminDb(),
}))

const {
  findLinkByExternalId,
  consumeLinkCode,
  deleteLink,
  getPending,
  createTransaction,
  addGoalContribution,
  getYearBudgets,
  getFinancialContextAdmin,
} = await import('./admin-data')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findLinkByExternalId', () => {
  it('builds the doc id as `${platform}_${externalId}` and returns the stored link', async () => {
    const get = vi.fn().mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) })
    const doc = vi.fn().mockReturnValue({ get })
    const collection = vi.fn().mockReturnValue({ doc })
    getAdminDb.mockReturnValue({ collection })

    const link = await findLinkByExternalId('telegram', '12345')

    expect(collection).toHaveBeenCalledWith('bot_links')
    expect(doc).toHaveBeenCalledWith('telegram_12345')
    expect(link).toEqual({ userId: 'user-1' })
  })

  it('returns null when no link exists for that chat', async () => {
    const get = vi.fn().mockResolvedValue({ exists: false })
    getAdminDb.mockReturnValue({ collection: () => ({ doc: () => ({ get }) }) })

    expect(await findLinkByExternalId('whatsapp', '999')).toBeNull()
  })
})

describe('consumeLinkCode', () => {
  function mockTxDb(codeDoc: { exists: boolean; data?: () => unknown }) {
    const txGet = vi.fn().mockResolvedValue(codeDoc)
    const txUpdate = vi.fn()
    const txSet = vi.fn()
    const codeDocFn = vi.fn().mockReturnValue({ id: 'code-ref' })
    const linkDocFn = vi.fn().mockReturnValue({ id: 'link-ref' })
    const collection = vi.fn((name: string) =>
      name === 'bot_link_codes' ? { doc: codeDocFn } : { doc: linkDocFn },
    )
    const mirrorRef = { id: 'mirror-ref' }
    const db = {
      collection,
      doc: vi.fn().mockReturnValue(mirrorRef),
      runTransaction: (fn: (tx: { get: typeof txGet; update: typeof txUpdate; set: typeof txSet }) => unknown) =>
        fn({ get: txGet, update: txUpdate, set: txSet }),
    }
    return { db, txGet, txUpdate, txSet, codeDocFn }
  }

  it('rejects an unknown code', async () => {
    const { db } = mockTxDb({ exists: false })
    getAdminDb.mockReturnValue(db)

    expect(await consumeLinkCode('ABCDEF', 'telegram', 'chat-1', null)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('rejects an already-used code', async () => {
    const { db } = mockTxDb({
      exists: true,
      data: () => ({ userId: 'user-1', usedAt: {}, expiresAt: { toMillis: () => Date.now() + 10_000 } }),
    })
    getAdminDb.mockReturnValue(db)

    expect(await consumeLinkCode('ABCDEF', 'telegram', 'chat-1', null)).toEqual({ ok: false, error: 'used' })
  })

  it('rejects an expired code', async () => {
    const { db } = mockTxDb({
      exists: true,
      data: () => ({ userId: 'user-1', usedAt: null, expiresAt: { toMillis: () => Date.now() - 1_000 } }),
    })
    getAdminDb.mockReturnValue(db)

    expect(await consumeLinkCode('ABCDEF', 'telegram', 'chat-1', null)).toEqual({ ok: false, error: 'expired' })
  })

  it('links on a valid unused code — normalises casing, marks it used, writes the link and its mirror', async () => {
    const { db, txUpdate, txSet, codeDocFn } = mockTxDb({
      exists: true,
      data: () => ({ userId: 'user-1', usedAt: null, expiresAt: { toMillis: () => Date.now() + 10_000 } }),
    })
    getAdminDb.mockReturnValue(db)

    const result = await consumeLinkCode('abcdef', 'telegram', 'chat-1', 'Budi')

    expect(result).toEqual({ ok: true, userId: 'user-1' })
    expect(codeDocFn).toHaveBeenCalledWith('ABCDEF') // trimmed + uppercased
    expect(txUpdate).toHaveBeenCalledTimes(1) // usedAt marked
    expect(txSet).toHaveBeenCalledTimes(2) // bot_links doc + user-readable mirror doc
  })
})

describe('deleteLink', () => {
  it('deletes the bot_links doc built from the externalId stored in the mirror, and clears that mirror field', async () => {
    const mirrorGet = vi.fn().mockResolvedValue({ data: () => ({ telegram: { externalId: 'chat-42' } }) })
    const linkDocRef = { id: 'telegram_chat-42' }
    const doc = vi.fn().mockReturnValue(linkDocRef)
    const collection = vi.fn().mockReturnValue({ doc })
    const batchDelete = vi.fn()
    const batchSet = vi.fn()
    const batchCommit = vi.fn().mockResolvedValue(undefined)

    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mirrorGet }),
      collection,
      batch: vi.fn().mockReturnValue({ delete: batchDelete, set: batchSet, commit: batchCommit }),
    })

    await deleteLink('user-1', 'telegram')

    expect(collection).toHaveBeenCalledWith('bot_links')
    expect(doc).toHaveBeenCalledWith('telegram_chat-42')
    expect(batchDelete).toHaveBeenCalledWith(linkDocRef)
    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('still clears the mirror field, without touching bot_links, when there is no entry for that platform', async () => {
    const mirrorGet = vi.fn().mockResolvedValue({ data: () => ({}) })
    const batchDelete = vi.fn()
    const batchSet = vi.fn()
    const batchCommit = vi.fn().mockResolvedValue(undefined)

    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mirrorGet }),
      collection: vi.fn(),
      batch: vi.fn().mockReturnValue({ delete: batchDelete, set: batchSet, commit: batchCommit }),
    })

    await deleteLink('user-1', 'whatsapp')

    expect(batchDelete).not.toHaveBeenCalled()
    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })
})

describe('getPending', () => {
  it('auto-clears and returns null once the draft has expired', async () => {
    const draftDelete = vi.fn().mockResolvedValue(undefined)
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        draft: { amount: 1, description: null, dateIso: '2026-01-01' },
        options: [],
        expiresAt: { toMillis: () => Date.now() - 1_000 },
      }),
    })
    getAdminDb.mockReturnValue({ doc: vi.fn().mockReturnValue({ get, delete: draftDelete }) })

    const result = await getPending('user-1')

    expect(result).toBeNull()
    expect(draftDelete).toHaveBeenCalledTimes(1)
  })

  it('returns the draft unchanged while still within its TTL', async () => {
    const del = vi.fn()
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        draft: { amount: 1, description: null, dateIso: '2026-01-01' },
        options: [],
        expiresAt: { toMillis: () => Date.now() + 10_000 },
      }),
    })
    getAdminDb.mockReturnValue({ doc: vi.fn().mockReturnValue({ get, delete: del }) })

    const result = await getPending('user-1')

    expect(result).not.toBeNull()
    expect(del).not.toHaveBeenCalled()
  })
})

describe('getPending — backward compatibility', () => {
  it('treats a draft written before `pendingKind` existed as a category confirmation', async () => {
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        // No `pendingKind` field at all — the shape every draft had before this field existed.
        draft: { amount: 1, description: null, dateIso: '2026-01-01' },
        options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
        expiresAt: { toMillis: () => Date.now() + 10_000 },
      }),
    })
    getAdminDb.mockReturnValue({ doc: vi.fn().mockReturnValue({ get, delete: vi.fn() }) })

    const result = await getPending('user-1')
    expect(result?.pendingKind).toBe('category_confirm')
  })
})

describe('addGoalContribution', () => {
  it('writes one contribution record and atomically increments the goal total, in a single batch', async () => {
    const contributionDoc = { id: 'contrib-1' }
    const goalRef = { id: 'goal-ref' }
    const batchSet = vi.fn()
    const batchUpdate = vi.fn()
    const batchCommit = vi.fn().mockResolvedValue(undefined)

    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(contributionDoc) }),
      doc: vi.fn().mockReturnValue(goalRef),
      batch: vi.fn().mockReturnValue({ set: batchSet, update: batchUpdate, commit: batchCommit }),
    })

    await addGoalContribution('user-1', 'goal-1', 500_000)

    expect(batchSet).toHaveBeenCalledWith(contributionDoc, expect.objectContaining({ goalId: 'goal-1', amount: 500_000 }))
    expect(batchUpdate).toHaveBeenCalledTimes(1)
    expect(batchUpdate.mock.calls[0][0]).toBe(goalRef)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })
})

describe('getYearBudgets', () => {
  it('queries monthly_budgets by a "YYYY-01".."YYYY-12" document-id range', async () => {
    const get = vi.fn().mockResolvedValue({ docs: [] })
    const where = vi.fn()
    const chain = { where, get }
    where.mockReturnValue(chain)
    const collection = vi.fn().mockReturnValue({ where })
    getAdminDb.mockReturnValue({ collection })

    await getYearBudgets('user-1', 2026)

    expect(collection).toHaveBeenCalledWith('users/user-1/monthly_budgets')
    expect(where).toHaveBeenCalledWith(expect.anything(), '>=', '2026-01')
    expect(where).toHaveBeenCalledWith(expect.anything(), '<=', '2026-12')
  })
})

describe('getFinancialContextAdmin', () => {
  it('computes liquid assets and existing monthly debt from live reads, not a stored snapshot', async () => {
    const emptyCollection = { get: vi.fn().mockResolvedValue({ docs: [] }) }
    const collection = vi.fn((path: string) => {
      if (path === 'users/user-1/assets') {
        return { get: vi.fn().mockResolvedValue({ docs: [{ id: 'a1', data: () => ({ type: 'savings', value: 20_000_000 }) }] }) }
      }
      if (path === 'users/user-1/liabilities') {
        return {
          get: vi.fn().mockResolvedValue({
            docs: [{ id: 'l1', data: () => ({ remainingAmount: 4_000_000, monthlyPayment: 500_000 }) }],
          }),
        }
      }
      if (path === 'users/user-1/transactions') {
        return { where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue({ docs: [] }) }
      }
      return emptyCollection // categories
    })
    const doc = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) })
    getAdminDb.mockReturnValue({ collection, doc })

    const context = await getFinancialContextAdmin('user-1', 2026, 9)

    expect(context.liquidAssets).toBe(20_000_000)
    expect(context.existingMonthlyDebt).toBe(500_000)
  })

  it('excludes a paid-off liability (remainingAmount 0) from existing monthly debt', async () => {
    const collection = vi.fn((path: string) => {
      if (path === 'users/user-1/liabilities') {
        return {
          get: vi.fn().mockResolvedValue({
            docs: [{ id: 'l1', data: () => ({ remainingAmount: 0, monthlyPayment: 500_000 }) }],
          }),
        }
      }
      if (path === 'users/user-1/transactions') return { where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue({ docs: [] }) }
      return { get: vi.fn().mockResolvedValue({ docs: [] }) }
    })
    const doc = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) })
    getAdminDb.mockReturnValue({ collection, doc })

    const context = await getFinancialContextAdmin('user-1', 2026, 9)
    expect(context.existingMonthlyDebt).toBe(0)
  })
})

describe('createTransaction', () => {
  it('never writes undefined-valued optional fields to Firestore', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({ collection: () => ({ doc: () => ({ set }) }) })

    await createTransaction('user-1', {
      date: new Date('2026-09-01'),
      type: 'expense',
      pillar: 'needs',
      categoryId: 'cat-food',
      amount: 25_000,
      tags: ['bot'],
    })

    const payload = set.mock.calls[0][0]
    expect('description' in payload).toBe(false)
    expect('gDriveFileId' in payload).toBe(false)
    expect(payload.amount).toBe(25_000)
  })

  it('stores the absolute value of amount, never a negative one', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({ collection: () => ({ doc: () => ({ set }) }) })

    await createTransaction('user-1', {
      date: new Date(),
      type: 'expense',
      pillar: 'needs',
      categoryId: 'cat-food',
      amount: -25_000,
      tags: [],
    })

    expect(set.mock.calls[0][0].amount).toBe(25_000)
  })
})
