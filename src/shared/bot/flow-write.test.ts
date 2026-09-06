import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { BotIncoming, DraftBatch } from './types'

const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const createTransactionsBatch = vi.fn()
const rememberLastBatch = vi.fn()
const getUserTimezone = vi.fn()
const setPending = vi.fn()

vi.mock('./admin-data', () => ({
  findCategories: (...a: unknown[]) => findCategories(...a),
  getMonthlyBudget: (...a: unknown[]) => getMonthlyBudget(...a),
  isBudgetClosedAdmin: (...a: unknown[]) => isBudgetClosedAdmin(...a),
  createTransactionsBatch: (...a: unknown[]) => createTransactionsBatch(...a),
  rememberLastBatch: (...a: unknown[]) => rememberLastBatch(...a),
  getUserTimezone: (...a: unknown[]) => getUserTimezone(...a),
  setPending: (...a: unknown[]) => setPending(...a),
}))

const parseTransactionBatch = vi.fn()
vi.mock('./parse-batch', () => ({ parseTransactionBatch: (...a: unknown[]) => parseTransactionBatch(...a) }))

const extractReceipt = vi.fn()
vi.mock('@/shared/lib/receipt-extraction', () => ({
  extractReceipt: (...a: unknown[]) => extractReceipt(...a),
  isAiQuotaOrOverloadError: (e: unknown) => (e as { status?: number })?.status === 429,
  ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  MAX_BASE64_CHARS: 6 * 1024 * 1024,
}))

const uploadReceiptForUser = vi.fn()
vi.mock('./drive-upload', () => ({ uploadReceiptForUser: (...a: unknown[]) => uploadReceiptForUser(...a) }))

const { handlePhoto, handleTextTransaction } = await import('./flow-write')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar, percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}
const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-salary', 'Gaji', 'income')]

const parsed = (over = {}) => ({
  type: 'expense', description: 'makan siang', amountText: '35rb',
  categoryCandidates: ['c-food'], dateOffset: 0, confidence: 95, ...over,
})

const photo = (caption?: string): Extract<BotIncoming, { kind: 'image' }> => ({
  platform: 'whatsapp', externalId: '1', kind: 'image',
  imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg', caption,
})

function receiptResult(over = {}) {
  return {
    extraction: {
      merchant: 'Indomaret', merchantType: 'supermarket', date: null,
      items: [{ name: 'Nasi goreng', totalPrice: 35000 }, { name: 'Teh', totalPrice: 24000 }],
      subtotal: 59000, tax: null, serviceCharge: null, discount: null, total: 59000,
      currency: 'IDR', confidence: 88, rawText: '', language: 'id',
    },
    mappedItems: [
      { name: 'Nasi goreng', totalPrice: 35000, suggestedCategoryId: 'c-food', suggestedCategoryName: 'Makan', suggestedPillar: 'needs', mappingConfidence: 90, mappingReason: '', isManuallyMapped: false },
      { name: 'Teh', totalPrice: 24000, suggestedCategoryId: 'c-food', suggestedCategoryName: 'Makan', suggestedPillar: 'needs', mappingConfidence: 85, mappingReason: '', isManuallyMapped: false },
    ],
    totalConfidence: 88,
    warnings: [],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findCategories.mockResolvedValue(CATEGORIES)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  createTransactionsBatch.mockResolvedValue(['t1'])
  getUserTimezone.mockResolvedValue('Asia/Jakarta')
  uploadReceiptForUser.mockResolvedValue({ gDriveFileId: 'f1', gDriveWebViewLink: 'https://drive/f1' })
})

describe('handleTextTransaction', () => {
  it('records a single confident line immediately, no review card', async () => {
    parseTransactionBatch.mockResolvedValue([parsed()])
    const reply = await handleTextTransaction('u1', 'makan siang 35rb')
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('Tercatat')
  })

  it('opens a review card when the message yields more than one transaction', async () => {
    parseTransactionBatch.mockResolvedValue([parsed(), parsed({ amountText: '50rb', description: 'bensin' })])
    const reply = await handleTextTransaction('u1', 'makan 35rb, bensin 50rb')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tinjau 2 Transaksi')
  })

  it('opens a review card when the only line is low-confidence', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ confidence: 20 })])
    await handleTextTransaction('u1', 'itu tadi 35rb')
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(createTransactionsBatch).not.toHaveBeenCalled()
  })

  it('opens a review card when the only line has no category at all', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ categoryCandidates: [], confidence: 95 })])
    await handleTextTransaction('u1', 'entah apa 35rb')
    expect(setPending).toHaveBeenCalledTimes(1)
  })

  it('records income and transfer as their own types on the fast path', async () => {
    parseTransactionBatch.mockResolvedValue([
      parsed({ type: 'income', categoryCandidates: ['c-salary'], amountText: '5jt' }),
    ])
    await handleTextTransaction('u1', 'gaji masuk 5jt')
    expect(createTransactionsBatch.mock.calls[0][1][0].type).toBe('income')
  })

  it('asks for a number when nothing in the message parses as an amount', async () => {
    parseTransactionBatch.mockResolvedValue([parsed({ amountText: 'tidak ada angka' })])
    const reply = await handleTextTransaction('u1', 'halo apa kabar')
    expect(reply.text).toContain('Nominalnya tidak ketemu')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('refuses the fast path into a closed month', async () => {
    isBudgetClosedAdmin.mockReturnValue(true)
    parseTransactionBatch.mockResolvedValue([parsed()])
    const reply = await handleTextTransaction('u1', 'makan 35rb')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('sudah ditutup')
  })
})

describe('handlePhoto', () => {
  it('never writes straight away — a receipt always opens a review card', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    const reply = await handlePhoto('u1', photo())
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tinjau 2 Transaksi')
  })

  it('uploads the photo to Drive and attaches it to the draft', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    await handlePhoto('u1', photo())
    const draft = setPending.mock.calls[0][1] as DraftBatch
    expect(draft.receipt).toEqual({ gDriveFileId: 'f1', gDriveWebViewLink: 'https://drive/f1' })
  })

  it('still opens the review card when Drive is not linked', async () => {
    uploadReceiptForUser.mockResolvedValue(null)
    extractReceipt.mockResolvedValue(receiptResult())
    const reply = await handlePhoto('u1', photo())
    expect((setPending.mock.calls[0][1] as DraftBatch).receipt).toBeUndefined()
    expect(reply.text).toContain('Tinjau')
  })

  it('carries the extraction warnings into the draft so the card shows them', async () => {
    extractReceipt.mockResolvedValue(receiptResult({ warnings: ['Gambar kurang jelas.'] }))
    await handlePhoto('u1', photo())
    expect((setPending.mock.calls[0][1] as DraftBatch).warnings).toContain('Gambar kurang jelas.')
  })

  it('opens a one-line review card from the receipt total when no items were read', async () => {
    extractReceipt.mockResolvedValue(
      receiptResult({
        extraction: { ...receiptResult().extraction, items: [] },
        mappedItems: [],
      }),
    )
    const reply = await handlePhoto('u1', photo())
    const draft = setPending.mock.calls[0][1] as DraftBatch
    expect(draft.lines).toHaveLength(1)
    expect(draft.lines[0].amount).toBe(59000)
    expect(reply.text).toContain('Tinjau Transaksi')
  })

  it('reports a quota failure distinctly and writes nothing', async () => {
    extractReceipt.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }))
    const reply = await handlePhoto('u1', photo())
    expect(reply.text).toContain('kuota')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('rejects an oversized image before spending a model call', async () => {
    const reply = await handlePhoto('u1', { ...photo(), imageBase64: 'x'.repeat(7 * 1024 * 1024) })
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('terlalu besar')
  })

  it('rejects an unsupported mime type before spending a model call', async () => {
    const reply = await handlePhoto('u1', { ...photo(), mimeType: 'application/pdf' })
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('bukan foto struk')
  })
})
