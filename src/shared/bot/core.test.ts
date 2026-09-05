import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatIDR } from '@/shared/lib/format'
import { dayKey } from '@/shared/lib/recurring'
import type { Asset, Category, Liability, RecurringRule, SavingsGoal, Transaction } from '@/shared/types/domain'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import type { Wishlist } from '@/shared/types/wishlist.types'
import type { BotIncomingImage, BotIncomingText } from './types'

// ─── Mocks ───────────────────────────────────────────────────────
// core.ts is the orchestrator — every collaborator it calls is mocked here so each
// test exercises only core.ts's own branching, not Firestore, Gemini, or Drive. The
// *pure* functions core.ts also imports (buildYearSummary, pendingOccurrences,
// projectSavings, analyseWishlistItem) are used for real — each already has its own
// dedicated test file, so exercising them for real here checks core.ts's wiring
// without re-deriving their internal correctness.

const findLinkByExternalId = vi.fn()
const consumeLinkCode = vi.fn()
const deleteLink = vi.fn()
const getPending = vi.fn()
const setPending = vi.fn()
const clearPending = vi.fn()
const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const getMonthTransactions = vi.fn()
const createTransaction = vi.fn()
const getRecentTransactions = vi.fn()
const getYearTransactions = vi.fn()
const getYearBudgets = vi.fn()
const findGoals = vi.fn()
const findGoalById = vi.fn()
const addGoalContribution = vi.fn()
const findAssets = vi.fn()
const findLiabilities = vi.fn()
const findRecurringRules = vi.fn()
const skipRecurringOccurrence = vi.fn()
const findWishlist = vi.fn()
const getFinancialContextAdmin = vi.fn()

vi.mock('./admin-data', () => ({
  findLinkByExternalId: (...args: unknown[]) => findLinkByExternalId(...args),
  consumeLinkCode: (...args: unknown[]) => consumeLinkCode(...args),
  deleteLink: (...args: unknown[]) => deleteLink(...args),
  getPending: (...args: unknown[]) => getPending(...args),
  setPending: (...args: unknown[]) => setPending(...args),
  clearPending: (...args: unknown[]) => clearPending(...args),
  findCategories: (...args: unknown[]) => findCategories(...args),
  getMonthlyBudget: (...args: unknown[]) => getMonthlyBudget(...args),
  isBudgetClosedAdmin: (...args: unknown[]) => isBudgetClosedAdmin(...args),
  getMonthTransactions: (...args: unknown[]) => getMonthTransactions(...args),
  createTransaction: (...args: unknown[]) => createTransaction(...args),
  getRecentTransactions: (...args: unknown[]) => getRecentTransactions(...args),
  getYearTransactions: (...args: unknown[]) => getYearTransactions(...args),
  getYearBudgets: (...args: unknown[]) => getYearBudgets(...args),
  findGoals: (...args: unknown[]) => findGoals(...args),
  findGoalById: (...args: unknown[]) => findGoalById(...args),
  addGoalContribution: (...args: unknown[]) => addGoalContribution(...args),
  findAssets: (...args: unknown[]) => findAssets(...args),
  findLiabilities: (...args: unknown[]) => findLiabilities(...args),
  findRecurringRules: (...args: unknown[]) => findRecurringRules(...args),
  skipRecurringOccurrence: (...args: unknown[]) => skipRecurringOccurrence(...args),
  findWishlist: (...args: unknown[]) => findWishlist(...args),
  getFinancialContextAdmin: (...args: unknown[]) => getFinancialContextAdmin(...args),
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
  isAiQuotaOrOverloadError: (err: unknown) => {
    const status = (err as { status?: unknown } | null)?.status
    return status === 429 || status === 503
  },
}))

const uploadReceiptForUser = vi.fn()
vi.mock('./drive-upload', () => ({
  uploadReceiptForUser: (...args: unknown[]) => uploadReceiptForUser(...args),
}))

// parse-amount is pure & already unit-tested (parse-amount.test.ts) — used for real here.
const { handleIncoming } = await import('./core')

// ─── Fixtures ────────────────────────────────────────────────────

function ts(date: Date) {
  return { toDate: () => date, toMillis: () => date.getTime() } as never
}

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

function mockGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    name: 'Dana Darurat',
    categoryId: 'cat-savings',
    targetAmount: 15_000_000,
    currentAmount: 8_500_000,
    monthlyContribution: 500_000,
    priority: 'high',
    isAchieved: false,
    createdAt: {} as never,
    ...overrides,
  }
}

function mockAsset(overrides: Partial<Asset> = {}): Asset {
  return { id: 'asset-1', name: 'Tabungan BCA', type: 'savings', value: 20_000_000, updatedAt: {} as never, ...overrides }
}

function mockLiability(overrides: Partial<Liability> = {}): Liability {
  return {
    id: 'liab-1',
    name: 'KTA',
    type: 'kta',
    totalAmount: 10_000_000,
    remainingAmount: 4_000_000,
    monthlyPayment: 500_000,
    updatedAt: {} as never,
    ...overrides,
  }
}

function mockRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    name: 'Sewa Kos',
    type: 'expense',
    categoryId: 'cat-food',
    amount: 1_500_000,
    frequency: 'monthly',
    dayOfMonth: 1,
    startDate: ts(new Date(2025, 0, 1)),
    isActive: true,
    createdAt: {} as never,
    ...overrides,
  }
}

function mockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: ts(new Date()),
    type: 'expense',
    pillar: 'needs',
    categoryId: 'cat-food',
    amount: 35000,
    tags: [],
    isRecurring: false,
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  }
}

function mockWishlistItem(overrides: Partial<Wishlist> = {}): Wishlist {
  return {
    id: 'wish-1',
    name: 'Laptop Kerja',
    estimatedPrice: 12_000_000,
    priority: 'high',
    status: 'idea',
    justification: 'need',
    financingMethod: 'cash',
    createdAt: {} as never,
    updatedAt: {} as never,
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
    expect(reply.text.toLowerCase()).toContain('belum tertaut')
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

  it('asks the user to pick a category on low confidence (as an inline keyboard), then records on a valid numeric reply', async () => {
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
    expect(setPending.mock.calls[0][1].pendingKind).toBe('category_confirm')
    expect(askReply.text).toContain(formatIDR(50000))
    expect(askReply.keyboard?.[0]?.[0]).toMatchObject({ label: 'Makan & Minum', value: '1' })
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
      pendingKind: 'category_confirm',
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
      pendingKind: 'category_confirm',
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
      pendingKind: 'category_confirm',
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
    parseIntent.mockResolvedValue({
      intent: 'add_income',
      description: 'gaji',
      categoryCandidates: ['cat-food'],
      dateOffset: 0,
      confidence: 95,
    })

    const reply = await handleIncoming(textMsg('gaji masuk 5jt'))
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
    expect(reply.text.toLowerCase()).toContain('struk tersimpan ke drive')
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

  it('replies with the AI-unavailable line (not the generic error) when Gemini returns 429/503', async () => {
    extractReceipt.mockRejectedValue(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }))

    const reply = await handleIncoming(imageMsg())

    expect(uploadReceiptForUser).not.toHaveBeenCalled()
    expect(createTransaction).not.toHaveBeenCalled()
    expect(reply.text).toContain('kuota')
    expect(reply.text).not.toContain('Ada masalah di sisi kami')
  })

  it('falls back to the generic error line for a non-quota extraction failure', async () => {
    extractReceipt.mockRejectedValue(new Error('boom'))

    const reply = await handleIncoming(imageMsg())

    expect(reply.text).toContain('Ada masalah di sisi kami')
  })

  it('drops a stale pending text draft when a photo arrives instead, and processes the photo', async () => {
    getPending.mockResolvedValue({
      pendingKind: 'category_confirm',
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

// ─── Read commands: /riwayat, /tahunan, /kekayaan ────────────────

describe('handleIncoming — read commands', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('/riwayat lists recent transactions with category names', async () => {
    matchReadCommand.mockReturnValue('get_recent')
    getRecentTransactions.mockResolvedValue([mockTransaction({ date: ts(new Date(2026, 8, 1)) })])

    const reply = await handleIncoming(textMsg('/riwayat'))
    expect(getRecentTransactions).toHaveBeenCalledWith('user-1', 5)
    expect(reply.text).toContain(formatIDR(35000))
    expect(reply.text).toContain('Makan &amp; Minum')
  })

  it('/riwayat with no transactions says so, not an empty list', async () => {
    matchReadCommand.mockReturnValue('get_recent')
    getRecentTransactions.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/riwayat'))
    expect(reply.text).toContain('Belum ada transaksi')
  })

  it('/tahunan builds a year summary from admin-data reads', async () => {
    matchReadCommand.mockReturnValue('get_year_summary')
    getYearTransactions.mockResolvedValue([])
    getYearBudgets.mockResolvedValue([])

    const reply = await handleIncoming(textMsg('/tahunan'))
    expect(getYearTransactions).toHaveBeenCalledWith('user-1', new Date().getFullYear())
    expect(reply.text).toContain(String(new Date().getFullYear()))
  })

  it('/kekayaan sums assets minus liabilities', async () => {
    matchReadCommand.mockReturnValue('net_worth')
    findAssets.mockResolvedValue([mockAsset({ value: 20_000_000 }), mockAsset({ id: 'asset-2', value: 5_000_000 })])
    findLiabilities.mockResolvedValue([mockLiability({ remainingAmount: 4_000_000 })])

    const reply = await handleIncoming(textMsg('/kekayaan'))
    expect(reply.text).toContain(formatIDR(21_000_000)) // 25,000,000 - 4,000,000
  })

  it('/batal with nothing pending says so instead of "unrecognized"', async () => {
    matchReadCommand.mockReturnValue('cancel_pending')
    const reply = await handleIncoming(textMsg('/batal'))
    expect(reply.text).toContain('Tidak ada')
    expect(clearPending).not.toHaveBeenCalled()
  })
})

// ─── /target & /setor ────────────────────────────────────────────

describe('handleIncoming — savings goals', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('/target lists goals with progress', async () => {
    matchReadCommand.mockReturnValue('list_goals')
    findGoals.mockResolvedValue([mockGoal()])
    const reply = await handleIncoming(textMsg('/target'))
    expect(reply.text).toContain('Dana Darurat')
    expect(reply.text).toContain('56.7%')
  })

  it('/target with no goals says so', async () => {
    matchReadCommand.mockReturnValue('list_goals')
    findGoals.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/target'))
    expect(reply.text).toContain('Belum ada target')
  })

  it('/setor end-to-end: pick a goal, then enter an amount, then it is recorded', async () => {
    matchReadCommand.mockReturnValue('contribute_goal')
    findGoals.mockResolvedValue([mockGoal({ id: 'goal-1', name: 'Dana Darurat' })])

    const pickReply = await handleIncoming(textMsg('/setor'))
    expect(setPending).toHaveBeenCalledTimes(1)
    expect(setPending.mock.calls[0][1]).toMatchObject({ pendingKind: 'goal_contribution', step: 'pick_goal' })
    expect(pickReply.keyboard?.[0]?.[0]).toMatchObject({ label: 'Dana Darurat', value: '1' })

    getPending.mockResolvedValue({ ...setPending.mock.calls[0][1], expiresAt: {} as never })
    const amountPrompt = await handleIncoming(textMsg('1'))
    expect(setPending).toHaveBeenCalledTimes(2)
    expect(setPending.mock.calls[1][1]).toMatchObject({ pendingKind: 'goal_contribution', step: 'enter_amount', goalId: 'goal-1' })
    expect(amountPrompt.text).toContain('Dana Darurat')

    getPending.mockResolvedValue({ ...setPending.mock.calls[1][1], expiresAt: {} as never })
    findGoalById.mockResolvedValue(mockGoal({ currentAmount: 9_000_000 }))
    const recordedReply = await handleIncoming(textMsg('500rb'))
    expect(clearPending).toHaveBeenCalledWith('user-1')
    expect(addGoalContribution).toHaveBeenCalledWith('user-1', 'goal-1', 500_000)
    expect(recordedReply.text).toContain(formatIDR(500_000))
    expect(recordedReply.text).toContain(formatIDR(9_000_000))
  })

  it('/setor with no goals says so, without setting a pending draft', async () => {
    matchReadCommand.mockReturnValue('contribute_goal')
    findGoals.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/setor'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('Belum ada target')
  })

  it('/setor asks again on an unparsable amount, without clearing the pending draft', async () => {
    getPending.mockResolvedValue({
      pendingKind: 'goal_contribution',
      step: 'enter_amount',
      options: [{ goalId: 'goal-1', name: 'Dana Darurat' }],
      goalId: 'goal-1',
      goalName: 'Dana Darurat',
      expiresAt: {} as never,
    })
    const reply = await handleIncoming(textMsg('entah berapa'))
    expect(clearPending).not.toHaveBeenCalled()
    expect(addGoalContribution).not.toHaveBeenCalled()
    expect(reply.text).toContain('tidak ketemu')
  })

  it('/setor can be cancelled mid-flow with "batal"', async () => {
    getPending.mockResolvedValue({
      pendingKind: 'goal_contribution',
      step: 'pick_goal',
      options: [{ goalId: 'goal-1', name: 'Dana Darurat' }],
      expiresAt: {} as never,
    })
    const reply = await handleIncoming(textMsg('batal'))
    expect(clearPending).toHaveBeenCalledWith('user-1')
    expect(reply.text).toContain('Dibatalkan')
  })
})

// ─── /rutin ──────────────────────────────────────────────────────

describe('handleIncoming — recurring rules', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('/rutin offers a "skip" button only for a rule actually due this month', async () => {
    matchReadCommand.mockReturnValue('list_recurring')
    findRecurringRules.mockResolvedValue([mockRule({ id: 'rule-1', dayOfMonth: 1 })])
    getMonthTransactions.mockResolvedValue([])

    const reply = await handleIncoming(textMsg('/rutin'))
    expect(reply.text).toContain('Sewa Kos')
    expect(reply.keyboard?.[0]?.[0].value).toMatch(/^skip_recurring:rule-1:/)
  })

  it('/rutin with no active rules says so', async () => {
    matchReadCommand.mockReturnValue('list_recurring')
    findRecurringRules.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/rutin'))
    expect(reply.text).toContain('Belum ada transaksi rutin')
  })

  it('skip_recurring: re-validates against the current month and skips a genuinely due occurrence', async () => {
    const rule = mockRule({ id: 'rule-1', dayOfMonth: 1 })
    findRecurringRules.mockResolvedValue([rule])
    getMonthTransactions.mockResolvedValue([])

    const now = new Date()
    const dk = dayKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const reply = await handleIncoming(textMsg(`skip_recurring:rule-1:${dk}`))
    expect(skipRecurringOccurrence).toHaveBeenCalledWith('user-1', 'rule-1', dk)
    expect(reply.text).toContain('dilewati')
  })

  it('skip_recurring: refuses a stale payload (rule no longer due) instead of skipping blindly', async () => {
    findRecurringRules.mockResolvedValue([mockRule({ id: 'rule-1', dayOfMonth: 1 })])
    // Already generated this month — pendingOccurrences will no longer consider it due.
    const now = new Date()
    getMonthTransactions.mockResolvedValue([
      mockTransaction({ date: ts(new Date(now.getFullYear(), now.getMonth(), 1)), amount: 1_500_000, recurringRuleId: 'rule-1' }),
    ])

    const dk = dayKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const reply = await handleIncoming(textMsg(`skip_recurring:rule-1:${dk}`))
    expect(skipRecurringOccurrence).not.toHaveBeenCalled()
    expect(reply.text).toContain('Sudah lewat')
  })
})

// ─── /wishlist ───────────────────────────────────────────────────

describe('handleIncoming — wishlist', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('/wishlist runs the affordability engine per open item', async () => {
    matchReadCommand.mockReturnValue('list_wishlist')
    findWishlist.mockResolvedValue([mockWishlistItem(), mockWishlistItem({ id: 'wish-2', name: 'Sudah Dibeli', status: 'purchased' })])
    getFinancialContextAdmin.mockResolvedValue({
      liquidAssets: 50_000_000,
      existingMonthlyDebt: 0,
      monthlyIncome: 10_000_000,
      monthlyExpenses: 5_000_000,
      remainingBudget: 3_000_000,
    })

    const reply = await handleIncoming(textMsg('/wishlist'))
    expect(reply.text).toContain('Laptop Kerja')
    expect(reply.text).not.toContain('Sudah Dibeli') // purchased items are excluded
  })

  it('/wishlist with nothing open says so', async () => {
    matchReadCommand.mockReturnValue('list_wishlist')
    findWishlist.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/wishlist'))
    expect(reply.text).toContain('kosong')
    expect(getFinancialContextAdmin).not.toHaveBeenCalled()
  })
})

// ─── /putuskan ───────────────────────────────────────────────────

describe('handleIncoming — unlink', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('/putuskan asks for confirmation first, without unlinking yet', async () => {
    matchReadCommand.mockReturnValue('unlink')
    const reply = await handleIncoming(textMsg('/putuskan'))
    expect(deleteLink).not.toHaveBeenCalled()
    expect(reply.keyboard?.[0]).toHaveLength(2)
  })

  it('tapping the confirm button actually unlinks', async () => {
    const reply = await handleIncoming(textMsg('unlink:confirm'))
    expect(deleteLink).toHaveBeenCalledWith('user-1', 'telegram')
    expect(reply.text).toContain('diputus')
  })

  it('tapping cancel leaves the link untouched', async () => {
    const reply = await handleIncoming(textMsg('unlink:cancel'))
    expect(deleteLink).not.toHaveBeenCalled()
    expect(reply.text).toContain('Dibatalkan')
  })
})
