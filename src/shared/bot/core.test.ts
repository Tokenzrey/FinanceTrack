import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatIDR } from '@/shared/lib/format'
import type { Category } from '@/shared/types/domain'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import type { BotIncomingImage, BotIncomingText } from './types'

// ─── Mocks ───────────────────────────────────────────────────────
// core.ts is the orchestrator — every collaborator it calls is mocked here so each
// test exercises only core.ts's own branching, not Firestore, Gemini, or Drive.

const findLinkByExternalId = vi.fn()
const consumeLinkCode = vi.fn()
const getPending = vi.fn()
const setPending = vi.fn()
const clearPending = vi.fn()
const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const getMonthTransactions = vi.fn()
const createTransaction = vi.fn()

vi.mock('./admin-data', () => ({
  findLinkByExternalId: (...args: unknown[]) => findLinkByExternalId(...args),
  consumeLinkCode: (...args: unknown[]) => consumeLinkCode(...args),
  getPending: (...args: unknown[]) => getPending(...args),
  setPending: (...args: unknown[]) => setPending(...args),
  clearPending: (...args: unknown[]) => clearPending(...args),
  findCategories: (...args: unknown[]) => findCategories(...args),
  getMonthlyBudget: (...args: unknown[]) => getMonthlyBudget(...args),
  isBudgetClosedAdmin: (...args: unknown[]) => isBudgetClosedAdmin(...args),
  getMonthTransactions: (...args: unknown[]) => getMonthTransactions(...args),
  createTransaction: (...args: unknown[]) => createTransaction(...args),
}))

const matchReadCommand = vi.fn()
const parseIntent = vi.fn()
vi.mock('./parse-intent', () => ({
  matchReadCommand: (...args: unknown[]) => matchReadCommand(...args),
  parseIntent: (...args: unknown[]) => parseIntent(...args),
}))

const extractReceipt = vi.fn()
vi.mock('@/shared/lib/receipt-extraction', () => ({
  extractReceipt: (...args: unknown[]) => extractReceipt(...args),
  ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  MAX_BASE64_CHARS: 6 * 1024 * 1024,
}))

const uploadReceiptForUser = vi.fn()
vi.mock('./drive-upload', () => ({
  uploadReceiptForUser: (...args: unknown[]) => uploadReceiptForUser(...args),
}))

// parse-amount is pure & already unit-tested (parse-amount.test.ts) — used for real here.
const { handleIncoming } = await import('./core')

// ─── Fixtures ────────────────────────────────────────────────────

function mockCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    name: 'Makan & Minum',
    pillar: 'needs',
    percentOfIncome: 20,
    color: '#f97316',
    icon: 'star',
    isSinkingFund: false,
    isRecurring: false,
    isActive: true,
    order: 0,
    // biome/eslint would flag `as any` outside tests; a Timestamp is never read by
    // any code path under test here.
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  }
}

function receiptResult(overrides: Partial<ReceiptScanResult> = {}): ReceiptScanResult {
  return {
    extraction: {
      merchant: 'Warung Bu Siti',
      merchantType: 'restaurant',
      date: '2026-09-01',
      items: [{ name: 'Nasi Goreng', totalPrice: 25000 }],
      subtotal: 25000,
      tax: null,
      serviceCharge: null,
      discount: null,
      total: 25000,
      currency: 'IDR',
      confidence: 90,
      rawText: 'raw',
      language: 'id',
    },
    mappedItems: [
      {
        name: 'Nasi Goreng',
        totalPrice: 25000,
        suggestedCategoryId: 'cat-food',
        suggestedCategoryName: 'Makan & Minum',
        suggestedPillar: 'needs',
        mappingConfidence: 90,
        mappingReason: '',
        isManuallyMapped: false,
      },
    ],
    totalConfidence: 90,
    warnings: [],
    ...overrides,
  }
}

function textMsg(text: string, platform: 'telegram' | 'whatsapp' = 'telegram'): BotIncomingText {
  return { platform, externalId: 'chat-1', kind: 'text', text }
}

function imageMsg(overrides: Partial<BotIncomingImage> = {}): BotIncomingImage {
  return {
    platform: 'telegram',
    externalId: 'chat-1',
    kind: 'image',
    imageBase64: 'ZmFrZQ==',
    mimeType: 'image/jpeg',
    ...overrides,
  }
}

const LINK = { userId: 'user-1', platform: 'telegram' as const, externalId: 'chat-1', displayName: null, linkedAt: {} as never }

beforeEach(() => {
  vi.clearAllMocks()
  matchReadCommand.mockReturnValue(null)
  getPending.mockResolvedValue(null)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  findCategories.mockResolvedValue([mockCategory()])
})

// ─── Linking ─────────────────────────────────────────────────────

describe('handleIncoming — linking', () => {
  it('tells an unlinked chat how to link, for an ordinary message', async () => {
    findLinkByExternalId.mockResolvedValue(null)
    const reply = await handleIncoming(textMsg('makan siang 35rb'))
    expect(reply.text).toContain('belum tertaut')
    expect(consumeLinkCode).not.toHaveBeenCalled()
  })

  it('links on a valid 6-character code', async () => {
    findLinkByExternalId.mockResolvedValue(null)
    consumeLinkCode.mockResolvedValue({ ok: true, userId: 'user-1' })
    const reply = await handleIncoming(textMsg('ab23cd'))
    expect(consumeLinkCode).toHaveBeenCalledWith('ab23cd', 'telegram', 'chat-1', null)
    expect(reply.text).toContain('tertaut')
  })

  it('reports an expired code distinctly from an unknown one', async () => {
    findLinkByExternalId.mockResolvedValue(null)
    consumeLinkCode.mockResolvedValue({ ok: false, error: 'expired' })
    const reply = await handleIncoming(textMsg('AB23CD'))
    expect(reply.text).toContain('kedaluwarsa')
  })

  it('reports an already-used code distinctly', async () => {
    findLinkByExternalId.mockResolvedValue(null)
    consumeLinkCode.mockResolvedValue({ ok: false, error: 'used' })
    const reply = await handleIncoming(textMsg('AB23CD'))
    expect(reply.text).toContain('sudah pernah dipakai')
  })
})

// ─── Text: recording a transaction ──────────────────────────────

describe('handleIncoming — text transactions', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('auto-records a high-confidence expense without asking', async () => {
    parseIntent.mockResolvedValue({
      intent: 'add_expense',
      description: 'makan siang',
      categoryCandidates: ['cat-food'],
      dateOffset: 0,
      confidence: 90,
    })

    const reply = await handleIncoming(textMsg('makan siang 35rb'))

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const [userId, dto] = createTransaction.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(dto).toMatchObject({ type: 'expense', pillar: 'needs', categoryId: 'cat-food', amount: 35000 })
    expect(reply.text).toContain('Tercatat')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('rejects a message with no parsable amount before ever calling Gemini', async () => {
    const reply = await handleIncoming(textMsg('makan siang enak banget'))
    expect(parseIntent).not.toHaveBeenCalled()
    expect(reply.text).toContain('Nominal')
  })

  it('treats an empty message as unrecognized', async () => {
    const reply = await handleIncoming(textMsg('   '))
    expect(reply.text).toContain('paham')
    expect(parseIntent).not.toHaveBeenCalled()
  })

  it('asks the user to pick a category on low confidence, then records on a valid numeric reply', async () => {
    findCategories.mockResolvedValue([mockCategory({ id: 'cat-food', name: 'Makan & Minum' }), mockCategory({ id: 'cat-transport', name: 'Transportasi' })])
    parseIntent.mockResolvedValue({
      intent: 'add_expense',
      description: 'beli sesuatu',
      categoryCandidates: ['cat-food', 'cat-transport'],
      dateOffset: 0,
      confidence: 30,
    })

    const askReply = await handleIncoming(textMsg('beli sesuatu 50rb'))
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(askReply.text).toContain(formatIDR(50000))
    expect(askReply.text).toContain('Makan & Minum')
    expect(createTransaction).not.toHaveBeenCalled()

    const pendingDraft = setPending.mock.calls[0][1]
    getPending.mockResolvedValue(pendingDraft)

    const confirmReply = await handleIncoming(textMsg('1'))
    expect(clearPending).toHaveBeenCalledWith('user-1')
    expect(createTransaction).toHaveBeenCalledTimes(1)
    expect(createTransaction.mock.calls[0][1]).toMatchObject({ categoryId: 'cat-food', amount: 50000 })
    expect(confirmReply.text).toContain('Tercatat')
  })

  it('keeps the pending draft alive on an out-of-range numeric reply', async () => {
    getPending.mockResolvedValue({
      draft: { amount: 50000, description: 'beli sesuatu', dateIso: new Date().toISOString() },
      options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
      expiresAt: {} as never,
    })

    const reply = await handleIncoming(textMsg('9'))
    expect(clearPending).not.toHaveBeenCalled()
    expect(createTransaction).not.toHaveBeenCalled()
    expect(reply.text).toContain('1-1')
  })

  it('cancels a pending draft on "batal"', async () => {
    getPending.mockResolvedValue({
      draft: { amount: 50000, description: null, dateIso: new Date().toISOString() },
      options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
      expiresAt: {} as never,
    })

    const reply = await handleIncoming(textMsg('batal'))
    expect(clearPending).toHaveBeenCalledWith('user-1')
    expect(createTransaction).not.toHaveBeenCalled()
    expect(reply.text).toContain('Dibatalkan')
  })

  it('abandons a stale pending draft when a fresh message arrives instead of a reply', async () => {
    getPending.mockResolvedValue({
      draft: { amount: 50000, description: null, dateIso: new Date().toISOString() },
      options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
      expiresAt: {} as never,
    })
    parseIntent.mockResolvedValue({
      intent: 'add_expense',
      description: 'ngopi',
      categoryCandidates: ['cat-food'],
      dateOffset: 0,
      confidence: 95,
    })

    const reply = await handleIncoming(textMsg('ngopi 20rb'))
    expect(clearPending).toHaveBeenCalledWith('user-1')
    // The fresh message is processed on its own merits — a brand new expense is recorded.
    expect(createTransaction).toHaveBeenCalledTimes(1)
    expect(createTransaction.mock.calls[0][1]).toMatchObject({ amount: 20000 })
    expect(reply.text).toContain('Tercatat')
  })

  it('rejects a closed month with a clear message and records nothing', async () => {
    isBudgetClosedAdmin.mockReturnValue(true)
    parseIntent.mockResolvedValue({
      intent: 'add_expense',
      description: 'makan siang',
      categoryCandidates: ['cat-food'],
      dateOffset: 0,
      confidence: 90,
    })

    const reply = await handleIncoming(textMsg('makan siang 35rb'))
    expect(createTransaction).not.toHaveBeenCalled()
    expect(reply.text).toContain('ditutup')
  })

  it('never lets an income intent settle on an income-pillar-excluded category, even if the model ignores the prompt rule', async () => {
    findCategories.mockResolvedValue([
      mockCategory({ id: 'cat-food', name: 'Makan & Minum', pillar: 'needs' }),
      mockCategory({ id: 'cat-salary', name: 'Gaji', pillar: 'income' }),
    ])
    // Model misbehaves: claims add_income but candidates an expense-pillar category.
    parseIntent.mockResolvedValue({
      intent: 'add_income',
      description: 'gaji',
      categoryCandidates: ['cat-food'],
      dateOffset: 0,
      confidence: 95,
    })

    const reply = await handleIncoming(textMsg('gaji masuk 5jt'))
    // cat-food is filtered out of the relevant pool (wrong pillar for add_income), so
    // there is no valid candidate left to auto-accept — the user is asked instead.
    expect(createTransaction).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
    const options = setPending.mock.calls[0][1].options
    expect(options.every((o: { categoryId: string }) => o.categoryId !== 'cat-food')).toBe(true)
    void reply
  })
})

// ─── Photos ──────────────────────────────────────────────────────

describe('handleIncoming — photos', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('extracts a receipt, uploads it, and records the transaction with the receipt attached', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    uploadReceiptForUser.mockResolvedValue({
      gDriveFileId: 'file-1',
      gDriveWebViewLink: 'https://drive.google.com/file-1',
    })

    const reply = await handleIncoming(imageMsg())

    expect(extractReceipt).toHaveBeenCalledTimes(1)
    expect(uploadReceiptForUser).toHaveBeenCalledTimes(1)
    expect(createTransaction).toHaveBeenCalledTimes(1)
    expect(createTransaction.mock.calls[0][1]).toMatchObject({
      amount: 25000,
      categoryId: 'cat-food',
      gDriveFileId: 'file-1',
    })
    expect(reply.text).toContain('struk tersimpan ke Drive')
  })

  it('rejects a photo that is not a receipt, without uploading or recording anything', async () => {
    extractReceipt.mockResolvedValue(receiptResult({ totalConfidence: 5, extraction: { ...receiptResult().extraction, total: 0 } }))

    const reply = await handleIncoming(imageMsg())

    expect(uploadReceiptForUser).not.toHaveBeenCalled()
    expect(createTransaction).not.toHaveBeenCalled()
    expect(reply.text).toContain('bukan foto struk')
  })

  it('still records the transaction, without an attachment, when Drive is not linked', async () => {
    extractReceipt.mockResolvedValue(receiptResult())
    uploadReceiptForUser.mockResolvedValue(null)

    const reply = await handleIncoming(imageMsg())

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const dto = createTransaction.mock.calls[0][1]
    expect(dto.gDriveFileId).toBeUndefined()
    expect(reply.text).toContain('Tercatat')
    expect(reply.text).toContain('tautkan Google Drive')
  })

  it('rejects an oversized image before ever calling extractReceipt', async () => {
    const reply = await handleIncoming(imageMsg({ imageBase64: 'x'.repeat(7 * 1024 * 1024) }))
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('terlalu besar')
  })

  it('drops a stale pending text draft when a photo arrives instead, and processes the photo', async () => {
    getPending.mockResolvedValue({
      draft: { amount: 50000, description: null, dateIso: new Date().toISOString() },
      options: [{ categoryId: 'cat-food', name: 'Makan & Minum' }],
      expiresAt: {} as never,
    })
    extractReceipt.mockResolvedValue(receiptResult())
    uploadReceiptForUser.mockResolvedValue(null)

    const reply = await handleIncoming(imageMsg())

    expect(clearPending).toHaveBeenCalledWith('user-1')
    expect(extractReceipt).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tercatat')
  })
})
