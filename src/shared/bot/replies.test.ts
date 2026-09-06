import { describe, expect, it } from 'vitest'
import type { CategorySummary, MonthlySummary } from '@/shared/types/domain'
import type { YearSummary } from '@/shared/lib/year-summary'
import { replies } from './replies'
import { DEFAULT_BOT_PREFS, type DraftBatch, type DraftLine } from './types'

const TZ = 'Asia/Jakarta'
const NOW_ISO = new Date(Date.UTC(2026, 8, 6, 7, 32, 0)).toISOString()

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    n: 1,
    type: 'expense',
    amount: 35000,
    description: 'Nasi goreng',
    categoryId: 'c-food',
    categoryName: 'Makan & Minum',
    dateIso: NOW_ISO,
    options: [{ categoryId: 'c-food', name: 'Makan & Minum' }],
    ...over,
  }
}

function batch(over: Partial<DraftBatch> = {}): DraftBatch {
  return {
    pendingKind: 'transaction_batch',
    source: 'receipt',
    lines: [line({ n: 1 }), line({ n: 2, amount: 24000, description: 'Teh botol', categoryId: null, categoryName: null, quantity: 2 })],
    mode: 'itemized',
    merchant: 'Indomaret',
    receiptTotal: 59000,
    warnings: ['Gambar kurang jelas — periksa setiap angka sebelum menyimpan.'],
    ...over,
  }
}

// A minimal but well-formed MonthlySummary — only the fields `summary`/`balance`
// actually read are populated; the pillar math itself is `budget-math.ts`'s job and
// already covered by its own tests.
function mockSummary(overrides: Partial<MonthlySummary> = {}): MonthlySummary {
  return {
    year: 2026,
    month: 9,
    totalIncome: 8_500_000,
    totalBudget: 6_800_000,
    totalUsed: 6_200_000,
    totalSaved: 1_700_000,
    netCashFlow: 2_300_000,
    savingsRate: 20,
    dailyAvgSpend: 200_000,
    topSpendingCategory: '',
    pillarSummary: {
      income: { budget: 8_500_000, used: 8_500_000 },
      needs: { budget: 4_250_000, used: 3_000_000 },
      wants: { budget: 2_550_000, used: 2_000_000 },
      savings: { budget: 1_700_000, used: 1_200_000 },
    },
    categories: [],
    ...overrides,
  } as MonthlySummary
}

function mockCategorySummary(overrides: Partial<CategorySummary> = {}): CategorySummary {
  return {
    category: {
      id: 'c-food',
      name: 'Makan & Minum',
      pillar: 'needs',
      percentOfIncome: 20,
      color: '#f97316',
      icon: 'coffee',
      isSinkingFund: false,
      isRecurring: false,
      isActive: true,
      order: 0,
      createdAt: {} as never,
      updatedAt: {} as never,
    },
    budget: 2_000_000,
    used: 1_200_000,
    remaining: 800_000,
    absorptionRate: 60,
    dailyBurnRate: 40_000,
    projectedMonthEnd: 1_800_000,
    daysLeft: 10,
    dailyAllowanceLeft: 80_000,
    status: 'safe',
    trend: 'stable',
    vsLastMonth: 8,
    ...overrides,
  }
}

// Count-based balance check: not a real HTML parser, but catches the actual failure
// mode that matters here — an unclosed/mismatched `<b>`, `<i>`, or `<code>` tag, which
// is exactly what makes Telegram reject the whole message (`parse_mode: 'HTML'`).
function assertBalancedTags(text: string) {
  for (const tag of ['b', 'i', 'code']) {
    const opens = (text.match(new RegExp(`<${tag}>`, 'g')) ?? []).length
    const closes = (text.match(new RegExp(`</${tag}>`, 'g')) ?? []).length
    expect(opens, `<${tag}> open/close mismatch in: ${text}`).toBe(closes)
  }
}

describe('escapeHtml (via any reply that echoes free text)', () => {
  it('escapes &, <, > in a dynamic value so it cannot break the HTML or be read as a tag', () => {
    const reply = replies.categoryList([{ name: 'Makan & <script>Minum</script>' }])
    expect(reply.text).toContain('Makan &amp; &lt;script&gt;Minum&lt;/script&gt;')
    expect(reply.text).not.toContain('<script>')
  })

  it('does not double-escape an already-safe name', () => {
    const reply = replies.categoryList([{ name: 'Makan & Minum' }])
    expect(reply.text).toContain('Makan &amp; Minum')
    expect(reply.text).not.toContain('&amp;amp;')
  })
})

describe('every templated reply produces balanced HTML tags', () => {
  const summary = mockSummary()
  const yearSummary: YearSummary = {
    year: 2026,
    months: [],
    totalIncome: 96_000_000,
    totalSpending: 68_000_000,
    totalSaved: 18_000_000,
    savingsRate: 18.75,
    bestMonth: { year: 2026, month: 2, income: 8_000_000, spending: 5_000_000, saved: 2_000_000, budget: 6_000_000, absorptionRate: 0.8, transactionCount: 10, activeDays: 8, hasData: true },
    worstMonth: { year: 2026, month: 12, income: 8_000_000, spending: 7_500_000, saved: 500_000, budget: 6_000_000, absorptionRate: 1.2, transactionCount: 20, activeDays: 15, hasData: true },
    loggingStreak: 9,
  }

  const cases: [string, ReturnType<(typeof replies)[keyof typeof replies]>][] = [
    ['notLinked', replies.notLinked()],
    ['linkSuccess', replies.linkSuccess()],
    ['linkCodeInvalid(expired)', replies.linkCodeInvalid('expired')],
    ['help', replies.help()],
    ['amountNotFound', replies.amountNotFound()],
    ['monthClosed', replies.monthClosed(2026, 9)],
    ['notAReceipt', replies.notAReceipt()],
    ['categoryConfirmPrompt', replies.categoryConfirmPrompt(50000, 'beli & sesuatu', [{ name: 'Makan & Minum' }])],
    ['transactionRecorded(saved)', replies.transactionRecorded(35000, 'Makan & Minum', 'saved', new Date('2026-09-06T07:32:00Z'), 'Asia/Jakarta')],
    ['transactionRecorded(drive_not_linked)', replies.transactionRecorded(35000, 'Makan & Minum', 'drive_not_linked', new Date('2026-09-06T07:32:00Z'), 'Asia/Jakarta')],
    ['summary', replies.summary(summary, [], { total: 78 }, DEFAULT_BOT_PREFS)],
    ['summary(ringkas)', replies.summary(summary, [], { total: 78 }, { ...DEFAULT_BOT_PREFS, verbosity: 'ringkas' })],
    ['balance', replies.balance(summary, null, DEFAULT_BOT_PREFS)],
    ['balance(pillar)', replies.balance(summary, 'needs', DEFAULT_BOT_PREFS)],
    ['categoryDetail', replies.categoryDetail(mockCategorySummary(), [{ amount: 35_000, description: 'Nasi goreng', date: new Date('2026-09-06T07:32:00Z') }], 'Asia/Jakarta')],
    ['categoryNotFound', replies.categoryNotFound('makan & minum', [{ name: 'Transportasi & <b>' }])],
    ['statsRich', replies.statsRich('September 2026', summary, [{ name: 'Toko <A>', total: 90_000, count: 3 }], [{ method: 'cash', total: 90_000 }], 55, 12_000)],
    ['exportReady', replies.exportReady('September 2026', 42)],
    ['exportEmpty', replies.exportEmpty('September 2026')],
    ['categoryList', replies.categoryList([{ name: 'Makan & Minum' }])],
    ['recentTransactions', replies.recentTransactions([], [])],
    ['yearSummary', replies.yearSummary(yearSummary)],
    ['noGoals', replies.noGoals()],
    ['goalList', replies.goalList([{ name: 'Dana & Darurat', currentAmount: 1, targetAmount: 2, percent: 50, projectedText: 'x' }])],
    ['goalAmountPrompt', replies.goalAmountPrompt('Dana & Darurat')],
    ['goalContributionRecorded', replies.goalContributionRecorded(500000, 'Dana & Darurat', 9000000, 15000000)],
    ['netWorth', replies.netWorth(100, 40)],
    ['noRecurring', replies.noRecurring()],
    ['recurringSkipped', replies.recurringSkipped('Sewa & Kos')],
    ['noWishlist', replies.noWishlist()],
    ['unlinkConfirmPrompt', replies.unlinkConfirmPrompt()],
    ['unlinkedFromChat', replies.unlinkedFromChat()],
  ]

  it.each(cases)('%s', (_name, reply) => {
    assertBalancedTags(reply.text)
    expect(reply.html).toBe(true)
  })
})

describe('categoryConfirmPrompt', () => {
  it('builds one keyboard row per option plus a trailing cancel row, numbered from 1', () => {
    const reply = replies.categoryConfirmPrompt(50000, 'beli sesuatu', [{ name: 'Makan & Minum' }, { name: 'Transportasi' }])
    expect(reply.keyboard).toEqual([
      [{ label: 'Makan & Minum', value: '1' }],
      [{ label: 'Transportasi', value: '2' }],
      [{ label: '❌ Batal', value: 'batal' }],
    ])
  })
})

describe('wishlistList — decision → emoji mapping', () => {
  const baseItem = {
    id: 'w1',
    name: 'Laptop',
    estimatedPrice: 12_000_000,
    priority: 'high' as const,
    status: 'idea' as const,
    justification: 'need' as const,
    financingMethod: 'cash' as const,
    createdAt: {} as never,
    updatedAt: {} as never,
  }

  it.each([
    ['Aman Dibeli', '🟢'],
    ['Gunakan Tabungan', '🟡'],
    ['Tunda (Risiko Tinggi)', '🔴'],
  ] as const)('%s maps to %s', (decision, emoji) => {
    const reply = replies.wishlistList([
      {
        item: baseItem,
        result: { recommendationScore: 50, decision, metrics: {} as never, insights: [] },
      },
    ])
    expect(reply.text).toContain(emoji)
  })
})

describe('replies.batchReview', () => {
  it('numbers every line and shows its amount and category', () => {
    const out = replies.batchReview(batch(), TZ)
    expect(out.text).toContain('<b>1.</b>')
    expect(out.text).toContain('<b>2.</b>')
    expect(out.text).toContain('Rp 35.000')
    expect(out.text).toContain('Makan &amp; Minum')
  })

  it('flags a line that still has no category', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('belum ada kategori')
  })

  it('carries a full date and time stamp', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('6 Sep 2026 · 14.32 WIB')
  })

  it('shows the receipt total and whether it matches the line sum', () => {
    const matching = replies.batchReview(batch(), TZ).text
    expect(matching).toContain('Total struk')
    expect(matching).toContain('cocok')

    const mismatched = replies.batchReview(batch({ receiptTotal: 90000 }), TZ).text
    expect(mismatched).toContain('selisih')
  })

  it('lists each extraction warning', () => {
    expect(replies.batchReview(batch(), TZ).text).toContain('Gambar kurang jelas')
  })

  it('escapes a merchant name that contains HTML-significant characters', () => {
    const out = replies.batchReview(batch({ merchant: 'Toko <B&B>' }), TZ)
    expect(out.text).toContain('Toko &lt;B&amp;B&gt;')
    expect(out.text).not.toContain('<B&B>')
  })

  it('offers a Telegram keyboard whose tokens all fit callback_data', () => {
    const out = replies.batchReview(batch(), TZ)
    const values = (out.keyboard ?? []).flat().map((b) => b.value)
    expect(values).toContain('rv:save')
    expect(values).toContain('rv:cancel')
    expect(values.every((v) => Buffer.byteLength(v, 'utf8') <= 64)).toBe(true)
  })

  it('offers WhatsApp the typed equivalents instead of the keyboard', () => {
    const out = replies.batchReview(batch(), TZ)
    expect(out.whatsappHints?.join('\n')).toContain('ok')
    expect(out.whatsappHints?.join('\n')).toContain('kat 2 1')
    expect(out.whatsappHints?.join('\n')).toContain('batal')
  })

  it('shows a merge button for a receipt batch and none for a text batch', () => {
    const receipt = (replies.batchReview(batch(), TZ).keyboard ?? []).flat().map((b) => b.value)
    expect(receipt).toContain('rv:mode:single')

    const text = (replies.batchReview(batch({ source: 'text' }), TZ).keyboard ?? []).flat().map((b) => b.value)
    expect(text).not.toContain('rv:mode:single')
  })

  it('renders the collapsed single line when mode is single', () => {
    const out = replies.batchReview(batch({ mode: 'single' }), TZ)
    expect(out.text).toContain('Rp 59.000')
    expect(out.text).not.toContain('<b>2.</b>')
    expect((out.keyboard ?? []).flat().map((b) => b.value)).toContain('rv:mode:itemized')
  })
})

describe('replies.batchSaved', () => {
  it('confirms every saved line with its own full timestamp', () => {
    const out = replies.batchSaved([line({ n: 1 }), line({ n: 2, type: 'income', amount: 5_000_000 })], 'itemized', TZ, 'saved')
    expect(out.text).toContain('2 transaksi')
    expect(out.text).toContain('6 Sep 2026 · 14.32 WIB')
    expect(out.text).toContain('Struk tersimpan')
  })

  it('tells the user Drive is not linked when the upload could not happen', () => {
    const out = replies.batchSaved([line()], 'itemized', TZ, 'drive_not_linked')
    expect(out.text).toContain('tautkan Google Drive')
  })

  it('mentions /undo so a mistake is one word away', () => {
    expect(replies.batchSaved([line()], 'itemized', TZ, 'none').text).toContain('/undo')
  })
})

describe('replies — review helpers', () => {
  it('reviewHelp lists every edit command with an example', () => {
    const text = replies.reviewHelp().text
    for (const cmd of ['ok', 'batal', 'hapus', 'kat', 'nom', 'ket', 'tgl', 'tipe', 'gabung', 'pisah']) {
      expect(text).toContain(cmd)
    }
  })

  it('reviewNeedsCategory names the exact lines still blocking the save', () => {
    expect(replies.reviewNeedsCategory([2, 4]).text).toContain('2')
    expect(replies.reviewNeedsCategory([2, 4]).text).toContain('4')
  })

  it('reviewInvalidLine states the valid range', () => {
    expect(replies.reviewInvalidLine(9, 3).text).toContain('1-3')
  })

  it('busyReviewing explains what to do instead of silently dropping the draft', () => {
    const text = replies.busyReviewing(2).text
    expect(text).toContain('2')
    expect(text).toContain('batal')
  })
})

describe('replies.transactionRecorded', () => {
  it('now carries a full date and time', () => {
    const out = replies.transactionRecorded(35000, 'Makan & Minum', 'none', new Date(NOW_ISO), TZ)
    expect(out.text).toContain('6 Sep 2026 · 14.32 WIB')
    expect(out.text).not.toContain('Hari ini')
  })
})
