import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatIDR } from '@/shared/lib/format'
import { dayKey } from '@/shared/lib/recurring'
import type { Asset, Category, Liability, RecurringRule, SavingsGoal, Transaction } from '@/shared/types/domain'
import type { Wishlist } from '@/shared/types/wishlist.types'
import type { BotIncoming, BotIncomingText } from './types'

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
const getUserTimezone = vi.fn()
const getTransactionsBetween = vi.fn()
const searchTransactions = vi.fn()
const getLastBatch = vi.fn()
const getTransactionsByIds = vi.fn()
const deleteTransactions = vi.fn()
const clearLastBatch = vi.fn()

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
  getUserTimezone: (...args: unknown[]) => getUserTimezone(...args),
  getTransactionsBetween: (...args: unknown[]) => getTransactionsBetween(...args),
  searchTransactions: (...args: unknown[]) => searchTransactions(...args),
  getLastBatch: (...args: unknown[]) => getLastBatch(...args),
  getTransactionsByIds: (...args: unknown[]) => getTransactionsByIds(...args),
  deleteTransactions: (...args: unknown[]) => deleteTransactions(...args),
  clearLastBatch: (...args: unknown[]) => clearLastBatch(...args),
  // Gemini quota ledger — core.ts wires these into the router on every call. No test
  // here drives a real router call, so plain stubs suffice.
  getModelHealth: async () => ({ dayKey: '', models: {} }),
  saveModelHealth: async () => {},
  // Bot prefs — dispatchText parses /mode & /atur before read commands. No test here
  // exercises that path, so the default shape is enough to keep the module complete.
  getBotPrefs: async () => ({
    verbosity: 'detail',
    autoAcceptConfidence: 60,
    alwaysReview: false,
    showInsights: true,
    quickCategories: [],
  }),
}))

const matchReadCommand = vi.fn()
vi.mock('./parse-intent', () => ({
  matchReadCommand: (...args: unknown[]) => matchReadCommand(...args),
}))

// The write paths live in flow-write.ts now (own test file); core.ts only dispatches.
const handleTextTransaction = vi.fn()
const handlePhoto = vi.fn()
vi.mock('./flow-write', () => ({
  handleTextTransaction: (...args: unknown[]) => handleTextTransaction(...args),
  handlePhoto: (...args: unknown[]) => handlePhoto(...args),
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

function imageMsg(): Extract<BotIncoming, { kind: 'image' }> {
  return { platform: 'telegram', externalId: 'chat-1', kind: 'image', imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg' }
}

const LINK = { userId: 'user-1', platform: 'telegram' as const, externalId: 'chat-1', displayName: null, linkedAt: {} as never }

beforeEach(() => {
  vi.clearAllMocks()
  matchReadCommand.mockReturnValue(null)
  getPending.mockResolvedValue(null)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  findCategories.mockResolvedValue([mockCategory()])
  getUserTimezone.mockResolvedValue('Asia/Jakarta')
  handleTextTransaction.mockResolvedValue({ text: 'stub: text transaction' })
  handlePhoto.mockResolvedValue({ text: 'stub: photo' })
  getTransactionsByIds.mockResolvedValue([])
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

// ─── Dispatch: text & photos hand off to flow-write ─────────────
// The write paths themselves (fast-path record vs. review card, receipt OCR) are
// covered in flow-write.test.ts / flow-review.test.ts. Here we only check that
// `handleIncoming` routes to them.

describe('handleIncoming — dispatch', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('hands a plain transaction message to handleTextTransaction, trimmed', async () => {
    const reply = await handleIncoming(textMsg('  makan siang 35rb  '))
    expect(handleTextTransaction).toHaveBeenCalledWith('user-1', 'makan siang 35rb')
    expect(handlePhoto).not.toHaveBeenCalled()
    expect(reply.text).toBe('stub: text transaction')
  })

  it('hands a photo to handlePhoto', async () => {
    const msg = imageMsg()
    const reply = await handleIncoming(msg)
    expect(handlePhoto).toHaveBeenCalledWith('user-1', msg)
    expect(handleTextTransaction).not.toHaveBeenCalled()
    expect(reply.text).toBe('stub: photo')
  })

  it('treats an empty message as unrecognized, without dispatching', async () => {
    const reply = await handleIncoming(textMsg('   '))
    expect(reply.text).toContain('paham')
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })

  it('routes a read command to the read handler, not to handleTextTransaction', async () => {
    matchReadCommand.mockReturnValue('get_summary')
    getMonthTransactions.mockResolvedValue([])
    await handleIncoming(textMsg('/ringkasan'))
    expect(handleTextTransaction).not.toHaveBeenCalled()
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

// ─── /undo, /cari, /hariini (Task 11) ───────────────────────────

describe('handleIncoming — /undo', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
    matchReadCommand.mockReturnValue('undo')
  })

  it('deletes the transactions from the last commit and clears the memory', async () => {
    getLastBatch.mockResolvedValue({ transactionIds: ['t1', 't2'], createdAt: {} })
    deleteTransactions.mockResolvedValue(2)

    const reply = await handleIncoming(textMsg('/undo'))

    expect(deleteTransactions).toHaveBeenCalledWith('user-1', ['t1', 't2'])
    expect(clearLastBatch).toHaveBeenCalledWith('user-1')
    expect(reply.text).toContain('2 transaksi dibatalkan')
  })

  it('says so plainly when there is nothing to undo', async () => {
    getLastBatch.mockResolvedValue(null)
    const reply = await handleIncoming(textMsg('/undo'))
    expect(deleteTransactions).not.toHaveBeenCalled()
    expect(reply.text).toContain('Tidak ada')
  })

  it('refuses to delete when the last batch touches a closed month', async () => {
    getLastBatch.mockResolvedValue({ transactionIds: ['t1', 't2'], createdAt: {} })
    getTransactionsByIds.mockResolvedValue([
      mockTransaction({ id: 't1', date: ts(new Date(2026, 6, 15)) }),
      mockTransaction({ id: 't2', date: ts(new Date(2026, 6, 20)) }),
    ])
    getMonthlyBudget.mockResolvedValue({ closedAt: ts(new Date()) })
    isBudgetClosedAdmin.mockReturnValue(true)

    const reply = await handleIncoming(textMsg('/undo'))

    expect(getMonthlyBudget).toHaveBeenCalledWith('user-1', 2026, 7)
    expect(deleteTransactions).not.toHaveBeenCalled()
    expect(clearLastBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('sudah ditutup')
  })

  it('proceeds when the last batch is entirely within an open month', async () => {
    getLastBatch.mockResolvedValue({ transactionIds: ['t1', 't2'], createdAt: {} })
    getTransactionsByIds.mockResolvedValue([
      mockTransaction({ id: 't1', date: ts(new Date(2026, 8, 1)) }),
      mockTransaction({ id: 't2', date: ts(new Date(2026, 8, 2)) }),
    ])
    isBudgetClosedAdmin.mockReturnValue(false)
    deleteTransactions.mockResolvedValue(2)

    const reply = await handleIncoming(textMsg('/undo'))

    expect(deleteTransactions).toHaveBeenCalledWith('user-1', ['t1', 't2'])
    expect(clearLastBatch).toHaveBeenCalledWith('user-1')
    expect(reply.text).toContain('2 transaksi dibatalkan')
  })
})

describe('handleIncoming — /cari', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('searches by keyword and lists what it found', async () => {
    searchTransactions.mockResolvedValue([
      { id: 't1', amount: 35000, categoryId: 'cat-food', type: 'expense', description: 'kopi susu', date: { toDate: () => new Date() } },
    ])
    const reply = await handleIncoming(textMsg('/cari kopi'))
    expect(searchTransactions).toHaveBeenCalledWith('user-1', 'kopi', expect.any(Number))
    expect(reply.text).toContain('kopi susu')
  })

  it('asks for a keyword when /cari is sent bare', async () => {
    matchReadCommand.mockReturnValue('search')
    const reply = await handleIncoming(textMsg('/cari'))
    expect(searchTransactions).not.toHaveBeenCalled()
    expect(reply.text).toContain('kata kunci')
  })

  it('reports an empty result rather than an empty list', async () => {
    searchTransactions.mockResolvedValue([])
    const reply = await handleIncoming(textMsg('/cari xyz'))
    expect(reply.text).toContain('Tidak ada transaksi')
  })
})

describe('handleIncoming — argument-taking commands', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
    getMonthTransactions.mockResolvedValue([])
  })

  it('/ringkasan <bulan> reports the named month, not the current one', async () => {
    const reply = await handleIncoming(textMsg('/ringkasan agustus'))
    expect(getMonthTransactions).toHaveBeenCalledWith('user-1', new Date().getFullYear(), 8)
    expect(reply.text).toContain('Ringkasan')
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })

  it('/saldo <pilar> narrows the reply to one pillar', async () => {
    const reply = await handleIncoming(textMsg('/saldo kebutuhan'))
    expect(reply.text).toContain('Kebutuhan')
    expect(reply.text).not.toContain('Keinginan')
  })

  it('/riwayat <n> <kata> searches by keyword with the count as a capped limit', async () => {
    searchTransactions.mockResolvedValue([])
    await handleIncoming(textMsg('/riwayat 10 kopi'))
    expect(searchTransactions).toHaveBeenCalledWith('user-1', 'kopi', 10)
  })

  it('/riwayat 0 clamps the count to 1 rather than passing 0 to the query (W8)', async () => {
    getRecentTransactions.mockResolvedValue([mockTransaction()])
    const reply = await handleIncoming(textMsg('/riwayat 0'))
    expect(getRecentTransactions).toHaveBeenCalledWith('user-1', 1)
    expect(reply.text).not.toContain('Belum ada transaksi')
  })

  it('/kategori <nama> details the matched active category', async () => {
    const reply = await handleIncoming(textMsg('/kategori makan'))
    expect(reply.text).toContain('Makan &amp; Minum')
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })

  it('/kategori <nama> with no match lists the active categories instead', async () => {
    const reply = await handleIncoming(textMsg('/kategori zzz'))
    expect(reply.text).toContain('Tidak ada kategori aktif')
  })

  it('/export <bulan> attaches a CSV document to the reply', async () => {
    getMonthTransactions.mockResolvedValue([mockTransaction()])
    const reply = await handleIncoming(textMsg('/export 8'))
    expect(reply.document?.filename).toMatch(/^fintrack-\d{4}-08\.csv$/)
    expect(reply.document?.mimeType).toBe('text/csv')
    expect(Buffer.from(reply.document!.base64, 'base64').toString('utf8')).toContain('Tanggal')
  })

  it('/export <bulan> with no transactions says so and sends no document', async () => {
    const reply = await handleIncoming(textMsg('/export 8'))
    expect(reply.document).toBeUndefined()
    expect(reply.text).toContain('Tidak ada transaksi')
  })

  it('/cari <kata> still works through the argument router (Task 11 reconciliation)', async () => {
    searchTransactions.mockResolvedValue([])
    await handleIncoming(textMsg('/cari kopi'))
    expect(searchTransactions).toHaveBeenCalledWith('user-1', 'kopi', expect.any(Number))
  })
})

describe('handleIncoming — /hariini', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
    matchReadCommand.mockReturnValue('today_summary')
  })

  it('sums only the transactions inside the user local day', async () => {
    getUserTimezone.mockResolvedValue('Asia/Jakarta')
    getTransactionsBetween.mockResolvedValue([
      { id: 't1', amount: 35000, type: 'expense', categoryId: 'cat-food', date: { toDate: () => new Date() } },
    ])
    const reply = await handleIncoming(textMsg('/hariini'))
    expect(reply.text).toContain('Rp 35.000')
  })
})

// ─── Adversarial wave A cheap notes ─────────────────────────────

describe('handleIncoming — stale review tokens (N4)', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
    getPending.mockResolvedValue(null) // TTL lapsed — nothing pending
  })

  it('answers a stale rv:* token instead of parsing it as a transaction', async () => {
    const reply = await handleIncoming(textMsg('rv:del:20'))
    expect(reply.text).toContain('tidak aktif')
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })
})

describe('handleIncoming — bare /export (N5)', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
  })

  it('exports the current month when /export is sent with no argument', async () => {
    getMonthTransactions.mockResolvedValue([mockTransaction()])
    const now = new Date()
    const reply = await handleIncoming(textMsg('/export'))
    expect(getMonthTransactions).toHaveBeenCalledWith('user-1', now.getFullYear(), now.getMonth() + 1)
    expect(reply.document?.mimeType).toBe('text/csv')
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })

  it('bare /ekspor works the same way', async () => {
    getMonthTransactions.mockResolvedValue([])
    await handleIncoming(textMsg('/ekspor'))
    expect(getMonthTransactions).toHaveBeenCalledTimes(1)
    expect(handleTextTransaction).not.toHaveBeenCalled()
  })
})

describe('handleIncoming — /undo mid-review (N10)', () => {
  beforeEach(() => {
    findLinkByExternalId.mockResolvedValue(LINK)
    getPending.mockResolvedValue({ pendingKind: 'transaction_batch', lines: [{ n: 1 }, { n: 2 }], expiresAt: {} as never })
    matchReadCommand.mockReturnValue('undo')
  })

  it('tells the user to finish the review and does NOT touch the previous committed batch', async () => {
    const reply = await handleIncoming(textMsg('/undo'))
    expect(getLastBatch).not.toHaveBeenCalled()
    expect(deleteTransactions).not.toHaveBeenCalled()
    expect(reply.text).toContain('Selesaikan dulu')
  })
})
