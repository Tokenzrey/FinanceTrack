import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayKeyInTz } from '@/shared/lib/format'

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

const adminData = await import('./admin-data')

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

describe('createLinkCode', () => {
  it('retries past a simulated code collision (gRPC code 6), then succeeds with .create()', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }))
      .mockResolvedValueOnce(undefined)
    const doc = vi.fn().mockReturnValue({ create })
    const collection = vi.fn().mockReturnValue({ doc })
    getAdminDb.mockReturnValue({ collection })

    const { code, expiresAt } = await adminData.createLinkCode('user-1')

    expect(collection).toHaveBeenCalledWith('bot_link_codes')
    expect(create).toHaveBeenCalledTimes(2)
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(expiresAt).toBeInstanceOf(Date)
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
        pendingKind: 'goal_contribution',
        step: 'pick_goal',
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

describe('getPending — unknown kinds', () => {
  it('drops a draft with no `pendingKind` (the retired pre-field / `category_confirm` shape)', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        // No `pendingKind` field at all — the shape every draft had before this field
        // existed, and the retired `category_confirm` flow. No longer answerable.
        draft: { amount: 1, description: null, dateIso: '2026-01-01' },
        options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
        expiresAt: { toMillis: () => Date.now() + 10_000 },
      }),
    })
    getAdminDb.mockReturnValue({ doc: vi.fn().mockReturnValue({ get, delete: del }) })

    const result = await getPending('user-1')
    expect(result).toBeNull()
    expect(del).toHaveBeenCalledTimes(1)
  })
})

describe('claimPendingForCommit', () => {
  function mockTxDb(initial: { exists: boolean; data?: () => unknown }) {
    const state = { ...initial }
    const txGet = vi.fn().mockImplementation(async () => ({ exists: state.exists, data: state.data }))
    const txDelete = vi.fn().mockImplementation(() => {
      state.exists = false
    })
    const db = {
      doc: vi.fn().mockReturnValue({ id: 'pending-ref' }),
      runTransaction: (fn: (tx: { get: typeof txGet; delete: typeof txDelete }) => unknown) =>
        fn({ get: txGet, delete: txDelete }),
    }
    return { db, txGet, txDelete }
  }

  const liveBatch = () => ({
    pendingKind: 'transaction_batch',
    lines: [{ n: 1 }],
    mode: 'itemized',
    expiresAt: { toMillis: () => Date.now() + 10_000 },
  })

  it('deletes the pending doc and returns the batch, in one transaction', async () => {
    const { db, txDelete } = mockTxDb({ exists: true, data: liveBatch })
    getAdminDb.mockReturnValue(db)

    const claimed = await adminData.claimPendingForCommit('user-1')

    expect(txDelete).toHaveBeenCalledTimes(1)
    expect(claimed).toMatchObject({ pendingKind: 'transaction_batch' })
  })

  it('returns null on the second call once the draft is gone', async () => {
    const { db } = mockTxDb({ exists: true, data: liveBatch })
    getAdminDb.mockReturnValue(db)

    const first = await adminData.claimPendingForCommit('user-1')
    const second = await adminData.claimPendingForCommit('user-1')

    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })

  it('returns null (and does not claim) for a non-batch pending draft', async () => {
    const { db, txDelete } = mockTxDb({
      exists: true,
      data: () => ({ pendingKind: 'goal_contribution', expiresAt: { toMillis: () => Date.now() + 10_000 } }),
    })
    getAdminDb.mockReturnValue(db)

    expect(await adminData.claimPendingForCommit('user-1')).toBeNull()
    expect(txDelete).not.toHaveBeenCalled()
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

describe('getTransactionsByIds', () => {
  it('fetches by documentId `in` chunks of 10 and maps {id, ...data}', async () => {
    const get = vi.fn().mockResolvedValue({ docs: [{ id: 'tx1', data: () => ({ amount: 1000 }) }] })
    const where = vi.fn().mockReturnValue({ get })
    const collection = vi.fn().mockReturnValue({ where })
    getAdminDb.mockReturnValue({ collection })

    const out = await adminData.getTransactionsByIds(
      'user-1',
      Array.from({ length: 12 }, (_, i) => `t${i}`),
    )

    expect(collection).toHaveBeenCalledWith('users/user-1/transactions')
    expect(where).toHaveBeenCalledTimes(2) // 12 ids → chunk of 10 + chunk of 2
    expect(where.mock.calls[0][1]).toBe('in')
    expect(where.mock.calls[0][2]).toHaveLength(10)
    expect(where.mock.calls[1][2]).toHaveLength(2)
    expect(out).toEqual([{ id: 'tx1', amount: 1000 }, { id: 'tx1', amount: 1000 }])
  })

  it('is a no-op for an empty id list', async () => {
    getAdminDb.mockReturnValue({ collection: vi.fn() })
    expect(await adminData.getTransactionsByIds('user-1', [])).toEqual([])
  })
})

describe('getTransactionsBetween', () => {
  it('queries a half-open [from, to) date range, newest first, mapping {id, ...data}', async () => {
    const get = vi.fn().mockResolvedValue({ docs: [{ id: 'tx1', data: () => ({ amount: 1000 }) }] })
    const orderBy = vi.fn().mockReturnValue({ get })
    const where2 = vi.fn().mockReturnValue({ orderBy })
    const where1 = vi.fn().mockReturnValue({ where: where2 })
    const collection = vi.fn().mockReturnValue({ where: where1 })
    getAdminDb.mockReturnValue({ collection })

    const out = await adminData.getTransactionsBetween(
      'user-1',
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-08T00:00:00Z'),
    )

    expect(collection).toHaveBeenCalledWith('users/user-1/transactions')
    expect(where1).toHaveBeenCalledWith('date', '>=', expect.anything())
    expect(where2).toHaveBeenCalledWith('date', '<', expect.anything())
    expect(orderBy).toHaveBeenCalledWith('date', 'desc')
    expect(out).toEqual([{ id: 'tx1', amount: 1000 }])
  })
})

describe('searchTransactions', () => {
  it('scans `scanLimit` recent rows, filters description by the needle (case-insensitive), slices to `limit`', async () => {
    const docs = [
      { id: 't1', data: () => ({ description: 'Kopi susu' }) },
      { id: 't2', data: () => ({ description: 'BENSIN pertamax' }) },
      { id: 't3', data: () => ({ description: 'kopi hitam' }) },
      { id: 't4', data: () => ({ description: 'Kopi latte' }) },
    ]
    const get = vi.fn().mockResolvedValue({ docs })
    const limit = vi.fn().mockReturnValue({ get })
    const orderBy = vi.fn().mockReturnValue({ limit })
    const collection = vi.fn().mockReturnValue({ orderBy })
    getAdminDb.mockReturnValue({ collection })

    const out = await adminData.searchTransactions('user-1', 'KOPI', 2, 500)

    expect(collection).toHaveBeenCalledWith('users/user-1/transactions')
    expect(orderBy).toHaveBeenCalledWith('date', 'desc')
    expect(limit).toHaveBeenCalledWith(500)
    expect(out.map((t) => t.id)).toEqual(['t1', 't3']) // 'BENSIN pertamax' filtered out, then sliced to 2
  })

  it('returns [] for a blank needle without touching Firestore', async () => {
    const collection = vi.fn()
    getAdminDb.mockReturnValue({ collection })
    expect(await adminData.searchTransactions('user-1', '   ', 10)).toEqual([])
    expect(collection).not.toHaveBeenCalled()
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

// ─── Task 6: batch writes, timezone lookup, undo memory ──────────
// These flows all read/write plain docs or one Firestore batch. Rather than the
// per-test inline mocks above, they share one small harness: `docData`/`docExists`
// stand in for whatever doc the function reads, and the batch/doc spies are asserted
// directly.

describe('multi-transaction persistence', () => {
  let docData: Record<string, unknown> | undefined
  let docExists = true
  const batchSet = vi.fn()
  const batchDelete = vi.fn()
  const batchCommit = vi.fn()
  const docSet = vi.fn()
  const docDelete = vi.fn()
  const futureTimestamp = () => ({ toMillis: () => Date.now() + 600_000 })

  beforeEach(() => {
    docData = undefined
    docExists = true
    batchCommit.mockResolvedValue(undefined)
    docSet.mockResolvedValue(undefined)
    docDelete.mockResolvedValue(undefined)

    const docRef = {
      id: 'new-id',
      get: vi.fn().mockImplementation(async () => ({ exists: docExists, data: () => docData })),
      set: docSet,
      delete: docDelete,
    }
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(docRef) }),
      doc: vi.fn().mockReturnValue(docRef),
      batch: vi.fn().mockReturnValue({ set: batchSet, delete: batchDelete, commit: batchCommit }),
    })
  })

  describe('createTransactionsBatch', () => {
    it('writes every DTO in one Firestore batch and returns their new ids', async () => {
      const ids = await adminData.createTransactionsBatch('user-1', [
        { date: new Date(), type: 'expense', pillar: 'needs', categoryId: 'c1', amount: 1000, tags: ['bot'] },
        { date: new Date(), type: 'income', pillar: 'income', categoryId: 'c2', amount: 2000, tags: ['bot'] },
      ])
      expect(ids).toHaveLength(2)
      expect(batchCommit).toHaveBeenCalledTimes(1)
      expect(batchSet).toHaveBeenCalledTimes(2)
    })

    it('is a no-op that commits nothing for an empty list', async () => {
      expect(await adminData.createTransactionsBatch('user-1', [])).toEqual([])
      expect(batchCommit).not.toHaveBeenCalled()
    })

    it('drops undefined optional fields rather than sending them to Firestore', async () => {
      await adminData.createTransactionsBatch('user-1', [
        { date: new Date(), type: 'expense', pillar: 'needs', categoryId: 'c1', amount: 1000, description: undefined },
      ])
      const written = batchSet.mock.calls[0][1] as Record<string, unknown>
      expect('description' in written).toBe(false)
      expect('gDriveFileId' in written).toBe(false)
    })

    it('preserves transfer as the written type', async () => {
      await adminData.createTransactionsBatch('user-1', [
        { date: new Date(), type: 'transfer', pillar: 'savings', categoryId: 'c1', amount: 1000 },
      ])
      expect((batchSet.mock.calls[0][1] as { type: string }).type).toBe('transfer')
    })
  })

  describe('getPending — legacy drafts', () => {
    it('clears and ignores a pendingKind this build no longer understands', async () => {
      docData = { pendingKind: 'bogus_v0', draft: {}, options: [], expiresAt: futureTimestamp() }
      expect(await adminData.getPending('user-1')).toBeNull()
      expect(docDelete).toHaveBeenCalled()
    })

    it('returns a transaction_batch draft unchanged', async () => {
      docData = {
        pendingKind: 'transaction_batch',
        source: 'text',
        lines: [],
        mode: 'itemized',
        merchant: null,
        receiptTotal: null,
        warnings: [],
        expiresAt: futureTimestamp(),
      }
      const pending = await adminData.getPending('user-1')
      expect(pending?.pendingKind).toBe('transaction_batch')
    })

    it('clears and returns null (never a TypeError) when expiresAt is a plain object with no toMillis (W2)', async () => {
      // A REST write / export-import / console edit stores `expiresAt` as a plain
      // `{_seconds,_nanoseconds}` rather than a live `Timestamp`.
      docData = { pendingKind: 'transaction_batch', lines: [], mode: 'itemized', expiresAt: { _seconds: 1 } }
      expect(await adminData.getPending('user-1')).toBeNull()
      expect(docDelete).toHaveBeenCalled()
    })
  })

  describe('getUserTimezone', () => {
    it('reads the profile timezone', async () => {
      docData = { timezone: 'Asia/Makassar' }
      expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Makassar')
    })

    it('defaults to Asia/Jakarta when the profile is missing or blank', async () => {
      docExists = false
      expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Jakarta')

      docExists = true
      docData = { timezone: '  ' }
      expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Jakarta')
    })

    it('falls back to Asia/Jakarta when the stored zone is not a valid IANA name (W1)', async () => {
      // A bogus zone would throw RangeError in every Intl.DateTimeFormat on the hot path.
      for (const bogus of ['Asia/Jkarta', 'WIB', 'not a zone']) {
        docData = { timezone: bogus }
        expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Jakarta')
      }
    })
  })

  describe('last batch (for /undo)', () => {
    it('remembers ids, reads them back, and clears them', async () => {
      await adminData.rememberLastBatch('user-1', ['t1', 't2'])
      expect(docSet).toHaveBeenCalled()

      docData = { transactionIds: ['t1', 't2'], createdAt: futureTimestamp() }
      expect((await adminData.getLastBatch('user-1'))?.transactionIds).toEqual(['t1', 't2'])

      await adminData.clearLastBatch('user-1')
      expect(docDelete).toHaveBeenCalled()
    })
  })

  describe('deleteTransactions', () => {
    it('deletes every id in one batch and reports the count', async () => {
      expect(await adminData.deleteTransactions('user-1', ['t1', 't2', 't3'])).toBe(3)
      expect(batchCommit).toHaveBeenCalledTimes(1)
    })

    it('commits nothing for an empty id list', async () => {
      expect(await adminData.deleteTransactions('user-1', [])).toBe(0)
      expect(batchCommit).not.toHaveBeenCalled()
    })
  })

  describe('saveModelHealth', () => {
    it('merge-writes only the touched model, never the whole map', async () => {
      await adminData.saveModelHealth('2026-09-07', 'gemini-3.5-flash', {
        used: 3,
        lastUsedAt: 1,
        cooldownUntil: 0,
      })
      const [payload, opts] = docSet.mock.calls[0]
      expect(opts).toEqual({ merge: true })
      expect(payload.dayKey).toBe('2026-09-07')
      expect(payload.models).toEqual({ 'gemini-3.5-flash': { used: 3, lastUsedAt: 1, cooldownUntil: 0 } })
    })

    it('does a whole-doc reset (no merge) when state is null', async () => {
      await adminData.saveModelHealth('2026-09-08', '', null)
      const [payload, opts] = docSet.mock.calls[0]
      expect(opts).toBeUndefined()
      expect(payload).toMatchObject({ dayKey: '2026-09-08', models: {} })
    })
  })

  describe('bumpUserModelCalls', () => {
    it('resets the counter to 1 on a new Pacific day', async () => {
      docData = { day: '2000-01-01', count: 5 }
      const n = await adminData.bumpUserModelCalls('user-1')
      expect(n).toBe(1)
      expect(docSet).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
    })

    it('increments (merge-write, no day reset) when the stored day is today', async () => {
      docData = { day: dayKeyInTz(new Date(), 'America/Los_Angeles'), count: 5 }
      await adminData.bumpUserModelCalls('user-1')
      const [payload, opts] = docSet.mock.calls[0]
      expect(opts).toEqual({ merge: true })
      expect(payload).not.toHaveProperty('day')
    })
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
