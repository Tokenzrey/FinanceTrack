import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { BotIncoming, DraftBatch, DraftLine } from './types'

const setPending = vi.fn()
const clearPending = vi.fn()
const claimPendingForCommit = vi.fn()
const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const createTransactionsBatch = vi.fn()
const rememberLastBatch = vi.fn()
const getUserTimezone = vi.fn()
const getScanHints = vi.fn()
const saveScanHints = vi.fn()

vi.mock('./admin-data', () => ({
  setPending: (...a: unknown[]) => setPending(...a),
  clearPending: (...a: unknown[]) => clearPending(...a),
  claimPendingForCommit: (...a: unknown[]) => claimPendingForCommit(...a),
  findCategories: (...a: unknown[]) => findCategories(...a),
  getMonthlyBudget: (...a: unknown[]) => getMonthlyBudget(...a),
  isBudgetClosedAdmin: (...a: unknown[]) => isBudgetClosedAdmin(...a),
  createTransactionsBatch: (...a: unknown[]) => createTransactionsBatch(...a),
  rememberLastBatch: (...a: unknown[]) => rememberLastBatch(...a),
  getUserTimezone: (...a: unknown[]) => getUserTimezone(...a),
  getScanHints: (...a: unknown[]) => getScanHints(...a),
  saveScanHints: (...a: unknown[]) => saveScanHints(...a),
}))

const { handleReviewMessage } = await import('./flow-review')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar,
    percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}

const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-transport', 'Transportasi', 'needs')]

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    n: 1, type: 'expense', amount: 35000, description: 'kopi',
    categoryId: 'c-food', categoryName: 'Makan',
    dateIso: new Date(Date.UTC(2026, 8, 6, 7, 32)).toISOString(),
    confidence: 90,
    options: [
      { categoryId: 'c-food', name: 'Makan' },
      { categoryId: 'c-transport', name: 'Transportasi' },
    ],
    ...over,
  }
}

function batch(over: Partial<DraftBatch> = {}): DraftBatch {
  return {
    pendingKind: 'transaction_batch', source: 'receipt',
    lines: [line({ n: 1 }), line({ n: 2, amount: 24000, description: 'teh' })],
    mode: 'itemized', merchant: 'Indomaret', receiptTotal: 59000, warnings: [],
    ...over,
  }
}

const text = (t: string): BotIncoming => ({ platform: 'telegram', externalId: '1', kind: 'text', text: t })
const photo = (): BotIncoming => ({
  platform: 'telegram', externalId: '1', kind: 'image', imageBase64: 'x', mimeType: 'image/jpeg',
})

beforeEach(() => {
  vi.clearAllMocks()
  findCategories.mockResolvedValue(CATEGORIES)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  createTransactionsBatch.mockResolvedValue(['t1', 't2'])
  getUserTimezone.mockResolvedValue('Asia/Jakarta')
  getScanHints.mockResolvedValue([])
  saveScanHints.mockResolvedValue(undefined)
  // Default: the claim succeeds and hands back a batch identical to the one under
  // review (what core.ts's getPending returned). Tests needing a specific shape or a
  // lost race override this.
  claimPendingForCommit.mockImplementation(async () => batch())
})

describe('handleReviewMessage — commit', () => {
  it('writes every line, remembers the batch for /undo, and claims the draft atomically', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(createTransactionsBatch.mock.calls[0][1]).toHaveLength(2)
    expect(rememberLastBatch).toHaveBeenCalledWith('u1', ['t1', 't2'])
    expect(claimPendingForCommit).toHaveBeenCalledWith('u1')
    expect(reply.text).toContain('2 transaksi tercatat')
  })

  it('writes exactly one transaction when the batch is in single mode', async () => {
    createTransactionsBatch.mockResolvedValue(['t1'])
    claimPendingForCommit.mockResolvedValue(batch({ mode: 'single' }))
    await handleReviewMessage('u1', batch({ mode: 'single' }), text('ok'))
    expect(createTransactionsBatch.mock.calls[0][1]).toHaveLength(1)
  })

  it('writes the batch exactly once when two concurrent commits race the same draft', async () => {
    // The claim is the single atomic step: the winner gets the batch, the loser null.
    claimPendingForCommit.mockResolvedValueOnce(batch()).mockResolvedValue(null)
    const [first, second] = await Promise.all([
      handleReviewMessage('u1', batch(), text('ok')),
      handleReviewMessage('u1', batch(), text('ok')),
    ])
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    const texts = [first.text, second.text]
    expect(texts.some((t) => t.includes('tercatat'))).toBe(true)
    expect(texts.some((t) => t.includes('Sudah diproses'))).toBe(true)
  })

  it('reports "already handled" and writes nothing when the claim comes back empty', async () => {
    claimPendingForCommit.mockResolvedValue(null)
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(rememberLastBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('Sudah diproses')
  })

  it('names the collapsed line\'s category in the confirmation for a single-mode save', async () => {
    // Heaviest line (laptop) is NOT line 1 — the confirmation must follow the write
    // (Elektronik), not lines[0] (Kafe).
    const single = batch({
      mode: 'single',
      merchant: null,
      lines: [
        line({ n: 1, amount: 20000, description: 'kopi', categoryId: 'c-food', categoryName: 'Makan' }),
        line({ n: 2, amount: 15_000_000, description: 'laptop', categoryId: 'c-transport', categoryName: 'Transportasi' }),
      ],
    })
    claimPendingForCommit.mockResolvedValue(single)
    createTransactionsBatch.mockResolvedValue(['t1'])
    const reply = await handleReviewMessage('u1', single, text('ok'))
    expect(reply.text).toContain('Transportasi')
    expect(reply.text).not.toContain('Makan')
  })

  it('refuses to save while a line has no category, and keeps the draft alive', async () => {
    const b = batch({ lines: [line({ n: 1 }), line({ n: 2, categoryId: null, categoryName: null })] })
    const reply = await handleReviewMessage('u1', b, text('ok'))
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(clearPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('belum punya kategori')
  })

  it('refuses to save into a closed month', async () => {
    isBudgetClosedAdmin.mockReturnValue(true)
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('sudah ditutup')
  })

  it('writes a category hint for every confirmed line', async () => {
    getScanHints.mockResolvedValue([])
    await handleReviewMessage('u1', batch(), text('ok'))
    expect(saveScanHints).toHaveBeenCalledTimes(1)
    const saved = saveScanHints.mock.calls[0][1] as { keyword: string; categoryId: string }[]
    expect(saved.some((h) => h.categoryId === 'c-food')).toBe(true)
  })

  it('still reports success when hint learning fails — the money is already saved', async () => {
    saveScanHints.mockRejectedValue(new Error('firestore down'))
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('tercatat')
  })
})

describe('handleReviewMessage — edits', () => {
  it('applies a category choice and re-renders the card', async () => {
    const b = batch({ lines: [line({ n: 1, categoryId: null, categoryName: null })] })
    const reply = await handleReviewMessage('u1', b, text('kat 1 2'))
    const saved = setPending.mock.calls[0][1] as DraftBatch
    expect(saved.lines[0].categoryId).toBe('c-transport')
    expect(reply.text).toContain('Tinjau')
  })

  it('applies an amount edit', async () => {
    await handleReviewMessage('u1', batch(), text('nom 1 40rb'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].amount).toBe(40000)
  })

  it('applies a description edit keeping the original casing', async () => {
    await handleReviewMessage('u1', batch(), text('ket 1 Kopi Susu'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].description).toBe('Kopi Susu')
  })

  it('applies a date edit', async () => {
    await handleReviewMessage('u1', batch(), text('tgl 1 2026-08-31'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].dateIso.slice(0, 10)).toBe('2026-08-31')
  })

  it('re-scopes the options when the type changes, so income lines cannot take spend categories', async () => {
    findCategories.mockResolvedValue([...CATEGORIES, cat('c-salary', 'Gaji', 'income')])
    await handleReviewMessage('u1', batch(), text('tipe 1 masuk'))
    const saved = (setPending.mock.calls[0][1] as DraftBatch).lines[0]
    expect(saved.type).toBe('income')
    expect(saved.options.map((o) => o.categoryId)).toEqual(['c-salary'])
    expect(saved.categoryId).toBeNull()
  })

  it('removes a line and renumbers what is left', async () => {
    await handleReviewMessage('u1', batch(), text('hapus 1'))
    const saved = setPending.mock.calls[0][1] as DraftBatch
    expect(saved.lines).toHaveLength(1)
    expect(saved.lines[0].n).toBe(1)
    expect(saved.lines[0].amount).toBe(24000)
  })

  it('cancels the whole batch when the last line is removed', async () => {
    const reply = await handleReviewMessage('u1', batch({ lines: [line()] }), text('hapus 1'))
    expect(clearPending).toHaveBeenCalledWith('u1')
    expect(reply.text).toContain('Tidak ada baris tersisa')
  })

  it('toggles between merged and itemized without losing lines (receipt, all one type)', async () => {
    await handleReviewMessage('u1', batch(), text('gabung'))
    const merged = setPending.mock.calls[0][1] as DraftBatch
    expect(merged.mode).toBe('single')
    expect(merged.lines).toHaveLength(2)
  })

  it('rejects "gabung" on a mixed income+expense batch, leaving the draft itemized', async () => {
    const mixed = batch({
      lines: [line({ n: 1, type: 'expense' }), line({ n: 2, type: 'income', amount: 5_000_000 })],
    })
    const reply = await handleReviewMessage('u1', mixed, text('gabung'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('sejenis')
  })

  it('rejects "gabung" on a typed (non-receipt) batch — merge is receipt-only', async () => {
    const reply = await handleReviewMessage('u1', batch({ source: 'text' }), text('gabung'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('struk')
  })

  it('re-validates a picked category against the live list and refuses one deleted since render', async () => {
    // The card still offers c-transport, but it is no longer in findCategories.
    findCategories.mockResolvedValue([cat('c-food', 'Makan', 'needs')])
    const b = batch({ lines: [line({ n: 1, categoryId: null, categoryName: null })] })
    const reply = await handleReviewMessage('u1', b, text('kat 1 2'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('tidak ada')
  })

  it('rejects an out-of-range line number and leaves the batch untouched', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('hapus 9'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('1-2')
  })
})

describe('handleReviewMessage — cancel, help, and non-commands', () => {
  it('cancels on "batal" and reports how many were dropped', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('batal'))
    expect(clearPending).toHaveBeenCalledWith('u1')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('2 transaksi')
  })

  it('shows the per-line edit menu for a focus tap', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('rv:edit:2'))
    expect(reply.text).toContain('Baris 2')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('answers bantuedit without touching the batch', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('bantuedit'))
    expect(reply.text).toContain('Perintah saat meninjau')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('keeps the batch alive when the text is not a review command', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('bensin 50rb'))
    expect(clearPending).not.toHaveBeenCalled()
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('menunggu konfirmasi')
  })

  it('does not silently drop the batch when a new photo arrives', async () => {
    const reply = await handleReviewMessage('u1', batch(), photo())
    expect(clearPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('menunggu konfirmasi')
  })
})
