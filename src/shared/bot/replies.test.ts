import { describe, expect, it } from 'vitest'
import type { MonthlySummary } from '@/shared/types/domain'
import type { YearSummary } from '@/shared/lib/year-summary'
import { replies } from './replies'

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
    pillarSummary: {
      needs: { budget: 4_250_000, used: 3_000_000 },
      wants: { budget: 2_550_000, used: 2_000_000 },
      savings: { budget: 1_700_000, used: 1_200_000 },
    },
    categorySummaries: [],
    ...overrides,
  } as MonthlySummary
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
    ['transactionRecorded(saved)', replies.transactionRecorded(35000, 'Makan & Minum', 'saved')],
    ['transactionRecorded(drive_not_linked)', replies.transactionRecorded(35000, 'Makan & Minum', 'drive_not_linked')],
    ['summary', replies.summary(summary)],
    ['balance', replies.balance(summary)],
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
