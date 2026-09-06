import {
  loggingConsistency,
  paymentMethodBreakdown,
  projectSavings,
  regretTotal,
  topMerchants,
} from '@/shared/lib/analytics'
import { buildMonthlySummary, daysElapsedInMonth, financialHealthScore } from '@/shared/lib/budget-math'
import { transactionsToCsv } from '@/shared/lib/csv-export'
import { dayKeyInTz, formatDayLong, formatIDR, formatMonthLong } from '@/shared/lib/format'
import { configureRouterIO } from '@/shared/lib/gemini-router'
import { buildInsights } from '@/shared/lib/insights'
import { dayKey, pendingOccurrences } from '@/shared/lib/recurring'
import { buildYearSummary } from '@/shared/lib/year-summary'
import { DEFAULT_PILLAR_CONFIG, type MonthlySummary, type Pillar, type Transaction } from '@/shared/types/domain'
import { analyseWishlistItem } from '@/shared/use-cases/wishlist/CalculateAffordability.usecase'
import * as adminData from './admin-data'
import type { BotPendingDraft } from './admin-data'
import { parseCommandArgs, type CommandArgs } from './command-args'
import { handlePhoto, handleTextTransaction } from './flow-write'
import { handleReviewMessage } from './flow-review'
import { parseAmount } from './parse-amount'
import { matchReadCommand } from './parse-intent'
import { parsePrefsCommand } from './prefs-commands'
import { replies } from './replies'
import type { BotIncoming, BotIntent, BotReply } from './types'

/**
 * The platform-agnostic heart of the bot. `handleIncoming` is the only export the
 * webhook adapters call — everything else here is private orchestration. No
 * `file_id`, `media id`, or platform-specific payload shape crosses into this file;
 * the adapters normalize all of that into `BotIncoming` first (see `types.ts`).
 */

const LINK_CODE_RE = /^[A-Z2-9]{6}$/

type GoalContributionDraft = Extract<BotPendingDraft, { pendingKind: 'goal_contribution' }>

export async function handleIncoming(msg: BotIncoming): Promise<BotReply> {
  // Point the Gemini router at the Firestore-backed quota ledger. Idempotent, and done
  // here rather than in `firebase-admin.ts` because wiring it there would create a
  // `firebase-admin → admin-data → firebase-admin` import cycle.
  configureRouterIO({ load: adminData.getModelHealth, save: adminData.saveModelHealth })

  const link = await adminData.findLinkByExternalId(msg.platform, msg.externalId)

  if (!link) {
    // An unlinked chat can only meaningfully do one thing: submit a link code.
    if (msg.kind === 'text' && LINK_CODE_RE.test(msg.text.trim().toUpperCase())) {
      const result = await adminData.consumeLinkCode(msg.text, msg.platform, msg.externalId, null)
      return result.ok ? replies.linkSuccess() : replies.linkCodeInvalid(result.error)
    }
    return replies.notLinked()
  }

  const userId = link.userId

  // Inline-keyboard button taps arrive as plain text (see the webhook adapters), but
  // carry a fixed action token instead of natural language — checked first, and
  // independent of any `botPending` draft, since these actions are fully
  // self-contained (see `replies.unlinkConfirmPrompt`/`recurringList`).
  if (msg.kind === 'text') {
    if (msg.text === 'unlink:confirm') {
      await adminData.deleteLink(userId, msg.platform)
      return replies.unlinkedFromChat()
    }
    if (msg.text === 'unlink:cancel') return replies.unlinkCancelled()
    if (msg.text.startsWith('skip_recurring:')) {
      return handleSkipRecurring(userId, msg.text.slice('skip_recurring:'.length))
    }
  }

  // A pending draft takes priority over everything else. A `transaction_batch` goes to
  // the review loop; the goal-contribution flow keeps its own two-step handler.
  const pending = await adminData.getPending(userId)
  if (pending) {
    if (pending.pendingKind === 'transaction_batch') {
      // Read commands still work mid-review — answering "/ringkasan" should not cost
      // the user their draft (see flow-review's no-silent-drop rule).
      if (msg.kind === 'text') {
        const readCommand = matchReadCommand(msg.text.trim())
        // `/undo` here would delete the PREVIOUS committed batch, not the pending draft
        // — a user who means `batal` must not silently reverse an unrelated commit.
        if (readCommand === 'undo') return replies.busyReviewing(pending.lines.length)
        if (readCommand && readCommand !== 'cancel_pending') {
          const answer = await handleReadCommand(userId, readCommand)
          return {
            ...answer,
            text: `${answer.text}\n\n<i>ℹ️ Masih ada ${pending.lines.length} transaksi menunggu — balas <code>ok</code> untuk simpan, <code>batal</code> untuk buang.</i>`,
          }
        }
        if (readCommand === 'cancel_pending') {
          await adminData.clearPending(userId)
          return replies.batchCancelled(pending.lines.length)
        }
      }
      return handleReviewMessage(userId, pending, msg)
    }
    return handlePendingReply(userId, pending, msg)
  }

  if (msg.kind === 'image') return handlePhoto(userId, msg)
  return dispatchText(userId, msg.text)
}

/** A plain text message with nothing pending: a read command, or a transaction to
 *  record. Also the landing spot when a fresh message abandons a stale pending draft. */
async function dispatchText(userId: string, text: string): Promise<BotReply> {
  const trimmed = text.trim()
  if (!trimmed) return replies.unknownMessage()

  // A review-card button (`rv:*`) that lands here has no live draft behind it — the
  // 15-min TTL lapsed, or the batch was already handled. Answer it plainly instead of
  // letting `parseAmount("20")` from `rv:del:20` open a bogus draft + model call.
  if (trimmed.startsWith('rv:')) return replies.reviewExpired()

  const prefsCommand = parsePrefsCommand(trimmed)
  if (prefsCommand.kind !== 'none') {
    if (prefsCommand.kind === 'invalid') return replies.prefsInvalid(prefsCommand.field)
    if (prefsCommand.kind === 'show') return replies.prefsCard(await adminData.getBotPrefs(userId))
    return replies.prefsUpdated(await adminData.saveBotPrefs(userId, prefsCommand.patch))
  }

  // Argument-taking commands (`/ringkasan agustus`, `/saldo kebutuhan`, `/kategori makan`,
  // `/riwayat 10 kopi`, `/cari kopi`, `/export 8`) are routed before the bare read-command
  // match, which only recognises a keyword with nothing after it.
  const parsed = parseCommandArgs(trimmed)
  // `export`/`ekspor` also runs bare (current month) — every other args command has a
  // bare read-command fallback, this one has none, so admit it with no args too.
  if (parsed && (parsed.args.length > 0 || parsed.command === 'export' || parsed.command === 'ekspor')) {
    const answer = await handleCommandWithArgs(userId, parsed)
    if (answer) return answer
  }

  const readCommand = matchReadCommand(trimmed)
  if (readCommand) return handleReadCommand(userId, readCommand)

  return handleTextTransaction(userId, trimmed)
}

// ─── Pending confirmation ────────────────────────────────────────

async function handlePendingReply(
  userId: string,
  pending: GoalContributionDraft,
  msg: BotIncoming,
): Promise<BotReply> {
  if (msg.kind !== 'text') {
    // A photo arrives while something else is pending — the stale draft is dropped
    // silently and the photo is processed fresh, rather than leaving the user stuck
    // answering a question about something unrelated.
    await adminData.clearPending(userId)
    return handlePhoto(userId, msg)
  }

  return handleGoalContributionReply(userId, pending, msg.text)
}

async function handleGoalContributionReply(
  userId: string,
  pending: GoalContributionDraft,
  text: string,
): Promise<BotReply> {
  const trimmed = text.trim()
  if (/^batal$/i.test(trimmed)) {
    await adminData.clearPending(userId)
    return replies.pendingCancelled()
  }

  if (pending.step === 'pick_goal') {
    if (/^\d+$/.test(trimmed)) {
      const choice = Number(trimmed)
      if (choice >= 1 && choice <= pending.options.length) {
        const picked = pending.options[choice - 1]
        await adminData.setPending(userId, {
          pendingKind: 'goal_contribution',
          step: 'enter_amount',
          options: pending.options,
          goalId: picked.goalId,
          goalName: picked.name,
        })
        return replies.goalAmountPrompt(picked.name)
      }
      return replies.invalidCategoryChoice(pending.options.length)
    }
    // Non-numeric, non-"batal" — treat as a fresh message abandoning this draft.
    await adminData.clearPending(userId)
    return dispatchText(userId, text)
  }

  // step === 'enter_amount'
  const amount = parseAmount(trimmed)
  if (amount === null) return replies.goalContributionInvalidAmount()

  await adminData.clearPending(userId)
  const goalId = pending.goalId as string
  await adminData.addGoalContribution(userId, goalId, amount)
  const goal = await adminData.findGoalById(userId, goalId)
  return replies.goalContributionRecorded(
    amount,
    pending.goalName ?? '',
    goal?.currentAmount ?? amount,
    goal?.targetAmount ?? amount,
  )
}

// ─── Read commands ───────────────────────────────────────────────

async function handleReadCommand(userId: string, intent: BotIntent): Promise<BotReply> {
  if (intent === 'help') return replies.help()
  if (intent === 'cancel_pending') return replies.cancelNothingPending()
  if (intent === 'unlink') return replies.unlinkConfirmPrompt()

  if (intent === 'list_categories') {
    const categories = await adminData.findCategories(userId)
    return replies.categoryList(categories.filter((c) => c.isActive && c.pillar !== 'income'))
  }

  if (intent === 'get_recent') return handleRecent(userId, 5, '')

  if (intent === 'get_year_summary') {
    const year = new Date().getFullYear()
    const [transactions, budgets, categories] = await Promise.all([
      adminData.getYearTransactions(userId, year),
      adminData.getYearBudgets(userId, year),
      adminData.findCategories(userId),
    ])
    return replies.yearSummary(buildYearSummary(year, transactions, budgets, categories))
  }

  if (intent === 'list_goals') return handleListGoals(userId)
  if (intent === 'contribute_goal') return handleContributeGoalStart(userId)
  if (intent === 'net_worth') return handleNetWorth(userId)
  if (intent === 'list_recurring') return handleListRecurring(userId)
  if (intent === 'list_wishlist') return handleListWishlist(userId)

  if (intent === 'search') return replies.searchNeedsKeyword()
  if (intent === 'undo') return handleUndo(userId)
  if (intent === 'today_summary') return handlePeriodSummary(userId, 'today')
  if (intent === 'week_summary') return handlePeriodSummary(userId, 'week')
  if (intent === 'stats') return handleStats(userId)

  // get_summary / get_balance both need the full monthly summary, for the month we're in.
  const now = new Date()
  return intent === 'get_summary'
    ? handleSummary(userId, now.getFullYear(), now.getMonth() + 1)
    : handleBalance(userId, null)
}

// ─── Argument-taking commands ───────────────────────────────────

const MONTH_NAMES = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
]

/** "/ringkasan 8", "/ringkasan agustus", "/ringkasan" → the month to report on. */
function monthFromArgs(args: string[], now: Date): { year: number; month: number } {
  const token = (args[0] ?? '').toLowerCase()
  if (/^\d{1,2}$/.test(token)) {
    const month = Number(token)
    if (month >= 1 && month <= 12) return { year: now.getFullYear(), month }
  }
  const named = MONTH_NAMES.indexOf(token)
  if (named >= 0) return { year: now.getFullYear(), month: named + 1 }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

const PILLAR_WORDS: Record<string, Pillar> = {
  kebutuhan: 'needs', needs: 'needs',
  keinginan: 'wants', wants: 'wants',
  tabungan: 'savings', savings: 'savings',
}

/** Commands that take arguments. Returns null when the command is not one of them, so
 *  the caller falls through to the existing bare-command path. */
async function handleCommandWithArgs(userId: string, cmd: CommandArgs): Promise<BotReply | null> {
  const now = new Date()

  switch (cmd.command) {
    case 'cari':
    case 'search':
      return cmd.raw ? handleSearch(userId, cmd.raw) : null

    case 'ringkasan':
    case 'summary': {
      const { year, month } = monthFromArgs(cmd.args, now)
      return handleSummary(userId, year, month)
    }

    case 'saldo':
    case 'sisa': {
      const pillar = PILLAR_WORDS[cmd.args[0]?.toLowerCase() ?? ''] ?? null
      return handleBalance(userId, pillar)
    }

    case 'kategori':
    case 'categories':
      return handleCategoryDetail(userId, cmd.raw)

    case 'riwayat':
    case 'history': {
      const hasCount = /^\d{1,2}$/.test(cmd.args[0] ?? '')
      const limit = hasCount ? Math.min(20, Number(cmd.args[0])) : 5
      const keyword = hasCount ? cmd.args.slice(1).join(' ') : cmd.raw
      return handleRecent(userId, limit, keyword)
    }

    case 'export':
    case 'ekspor': {
      const { year, month } = monthFromArgs(cmd.args, now)
      return handleExport(userId, year, month)
    }

    default:
      return null
  }
}

/** The month's summary, ready for the `/ringkasan` reply — reuses `budget-math.ts`,
 *  `insights.ts` and the health score the web dashboard already runs. */
async function handleSummary(userId: string, year: number, month: number): Promise<BotReply> {
  const [categories, budget, transactions, prefs] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
    adminData.getBotPrefs(userId),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  return replies.summary(summary, buildInsights(summary, transactions), quickHealth(summary, transactions), prefs)
}

/**
 * The financial-health score, from the inputs the bot has cheaply in hand this month.
 * ponytail: emergency-fund progress and debt-to-income aren't loaded on the bot path
 * (they need assets + liabilities reads); pass them as 0 rather than add two round
 * trips for one summary line. The web dashboard computes the full score.
 */
function quickHealth(summary: MonthlySummary, transactions: Transaction[]): { total: number } {
  const spend = summary.categories.filter((c) => c.category.pillar !== 'income')
  const scored = spend.filter((c) => c.budget > 0)
  const withinBudget = scored.filter((c) => c.absorptionRate <= 100).length
  const expenses = transactions.filter((t) => t.type !== 'income')
  const regretCount = expenses.filter((t) => t.mood === 'regret').length

  return financialHealthScore({
    savingsRate: summary.savingsRate,
    budgetAdherence: scored.length > 0 ? (withinBudget / scored.length) * 100 : 100,
    emergencyFundProgress: 0,
    debtToIncomeRatio: 0,
    consistency: loggingConsistency(transactions, daysElapsedInMonth(summary.year, summary.month)),
    moodPositiveRate: expenses.length > 0 ? 100 - (regretCount / expenses.length) * 100 : 100,
  })
}

async function handleBalance(userId: string, pillar: Pillar | null): Promise<BotReply> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [categories, budget, transactions, prefs] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
    adminData.getBotPrefs(userId),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  return replies.balance(summary, pillar, prefs)
}

/** `/riwayat`, `/riwayat 10`, `/riwayat 10 kopi` — a keyword narrows by description. */
async function handleRecent(userId: string, limit: number, keyword: string): Promise<BotReply> {
  const [transactions, categories] = await Promise.all([
    keyword
      ? adminData.searchTransactions(userId, keyword, limit)
      : adminData.getRecentTransactions(userId, limit),
    adminData.findCategories(userId),
  ])
  return replies.recentTransactions(transactions, categories)
}

/** `/kategori <nama>` — one category's burn rate, projection and last five transactions,
 *  from the same `buildMonthlySummary` row the dashboard shows. */
async function handleCategoryDetail(userId: string, name: string): Promise<BotReply> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [categories, budget, transactions, tz] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
    adminData.getUserTimezone(userId),
  ])

  const active = categories.filter((c) => c.isActive)
  const needle = name.trim().toLowerCase()
  const category = active.find((c) => c.name.toLowerCase().includes(needle))
  if (!category) return replies.categoryNotFound(name, active)

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })
  const row = summary.categories.find((c) => c.category.id === category.id)
  if (!row) return replies.genericError()

  const recent = transactions
    .filter((t) => t.categoryId === category.id)
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
    .slice(0, 5)
    .map((t) => ({ amount: t.amount, description: t.description ?? '—', date: t.date.toDate() }))

  return replies.categoryDetail(row, recent, tz)
}

/** `/export [bulan]` — a real CSV, sent as a document by both route adapters. */
async function handleExport(userId: string, year: number, month: number): Promise<BotReply> {
  const [transactions, categories] = await Promise.all([
    adminData.getMonthTransactions(userId, year, month),
    adminData.findCategories(userId),
  ])
  const label = formatMonthLong(year, month)
  if (transactions.length === 0) return replies.exportEmpty(label)

  const sorted = [...transactions].sort((a, b) => a.date.toMillis() - b.date.toMillis())
  // The BOM (﻿) is what makes Excel read the file as UTF-8 instead of ANSI —
  // without it "Keuangan Rumah" arrives mangled, same reason `downloadCsv` adds it.
  const csv = `﻿${transactionsToCsv(sorted, categories)}`

  return {
    ...replies.exportReady(label, transactions.length),
    document: {
      filename: `fintrack-${year}-${String(month).padStart(2, '0')}.csv`,
      mimeType: 'text/csv',
      base64: Buffer.from(csv, 'utf8').toString('base64'),
    },
  }
}

// ─── /undo, /cari, /hariini, /minggu, /statistik ────────────────

async function handleUndo(userId: string): Promise<BotReply> {
  const last = await adminData.getLastBatch(userId)
  if (!last) return replies.nothingToUndo()

  // Deleting from a closed month is the same mutation class as writing into one, which
  // `commit`/`commitDirect` both refuse. Load the batch's transactions to learn which
  // months they fall in and block the undo if any of those is locked.
  const txns = await adminData.getTransactionsByIds(userId, last.transactionIds)
  const months = new Map<string, { year: number; month: number }>()
  for (const tx of txns) {
    const d = tx.date.toDate()
    months.set(`${d.getFullYear()}-${d.getMonth() + 1}`, { year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  for (const { year, month } of months.values()) {
    const budget = await adminData.getMonthlyBudget(userId, year, month)
    if (adminData.isBudgetClosedAdmin(budget)) return replies.monthClosed(year, month)
  }

  const count = await adminData.deleteTransactions(userId, last.transactionIds)
  await adminData.clearLastBatch(userId)
  return replies.undone(count)
}

async function handleSearch(userId: string, keyword: string): Promise<BotReply> {
  const [matches, categories, tz] = await Promise.all([
    adminData.searchTransactions(userId, keyword, 10),
    adminData.findCategories(userId),
    adminData.getUserTimezone(userId),
  ])
  if (matches.length === 0) return replies.searchEmpty(keyword)

  const byId = new Map(categories.map((c) => [c.id, c.name]))
  return replies.searchResults(
    keyword,
    matches.map((tx) => ({
      amount: tx.amount,
      categoryName: byId.get(tx.categoryId) ?? 'Tanpa kategori',
      description: tx.description ?? '—',
      date: tx.date.toDate(),
    })),
    tz,
  )
}

/** Milliseconds `timeZone` is ahead of UTC at `at`. Derived from Intl rather than a
 *  hardcoded +7, so a user in WITA/WIT gets their own midnight. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const asLocal = new Date(at.toLocaleString('en-US', { timeZone }))
  return asLocal.getTime() - asUtc.getTime()
}

/** "Today" and "this week" must be bounded by the USER's midnight, not the server's —
 *  a 23:30 WIB expense belongs to today, and a UTC boundary would file it as tomorrow. */
async function handlePeriodSummary(userId: string, period: 'today' | 'week'): Promise<BotReply> {
  const tz = await adminData.getUserTimezone(userId)
  const now = new Date()
  const [y, m, d] = dayKeyInTz(now, tz).split('-').map(Number)

  // Local midnight as an instant: read the local wall-clock midnight as if it were
  // UTC, then subtract the zone's offset at that moment.
  const from = new Date(Date.UTC(y, m - 1, d) - tzOffsetMs(now, tz))
  if (period === 'week') from.setUTCDate(from.getUTCDate() - 6)
  const to = new Date(from.getTime() + (period === 'week' ? 7 : 1) * 86_400_000)

  const [transactions, categories] = await Promise.all([
    adminData.getTransactionsBetween(userId, from, to),
    adminData.findCategories(userId),
  ])

  const spend = transactions.filter((tx) => tx.type === 'expense')
  const byId = new Map(categories.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()
  for (const tx of spend) {
    const name = byId.get(tx.categoryId) ?? 'Tanpa kategori'
    totals.set(name, (totals.get(name) ?? 0) + tx.amount)
  }

  const rows = [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((sum, r) => sum + r.amount, 0)
  const title =
    period === 'today' ? `📅 <b>Hari Ini</b> — ${formatDayLong(now, tz)}` : '📅 <b>7 Hari Terakhir</b>'

  return replies.periodSummary(title, rows, total, spend.length)
}

async function handleStats(userId: string): Promise<BotReply> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const [categories, budget, transactions] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getMonthlyBudget(userId, year, month),
    adminData.getMonthTransactions(userId, year, month),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  return replies.statsRich(
    formatMonthLong(year, month),
    summary,
    topMerchants(transactions),
    paymentMethodBreakdown(transactions),
    loggingConsistency(transactions, daysElapsedInMonth(year, month)),
    regretTotal(transactions),
  )
}

// ─── /target & /setor ────────────────────────────────────────────

async function handleListGoals(userId: string): Promise<BotReply> {
  const goals = await adminData.findGoals(userId)
  if (goals.length === 0) return replies.noGoals()

  const rows = goals.map((g) => {
    const percent = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0
    const projection = projectSavings(g.currentAmount, g.targetAmount, g.monthlyContribution)
    const projectedText =
      projection.monthsToTarget === 0
        ? 'Sudah tercapai! 🎉'
        : projection.monthsToTarget === null || !projection.projectedDate
          ? 'Belum ada rencana setoran bulanan.'
          : `Estimasi tercapai: ${formatMonthLong(projection.projectedDate.getFullYear(), projection.projectedDate.getMonth() + 1)} (setor ${formatIDR(g.monthlyContribution)}/bln)`
    return { name: g.name, currentAmount: g.currentAmount, targetAmount: g.targetAmount, percent, projectedText }
  })

  return replies.goalList(rows)
}

async function handleContributeGoalStart(userId: string): Promise<BotReply> {
  const goals = await adminData.findGoals(userId)
  if (goals.length === 0) return replies.noGoals()

  const options = goals.map((g) => ({ goalId: g.id, name: g.name }))
  await adminData.setPending(userId, { pendingKind: 'goal_contribution', step: 'pick_goal', options })
  return replies.goalPickPrompt(options)
}

// ─── /kekayaan ───────────────────────────────────────────────────

async function handleNetWorth(userId: string): Promise<BotReply> {
  const [assets, liabilities] = await Promise.all([adminData.findAssets(userId), adminData.findLiabilities(userId)])
  const totalAssets = assets.reduce((sum, a) => sum + a.value, 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.remainingAmount, 0)
  return replies.netWorth(totalAssets, totalLiabilities)
}

// ─── /rutin ──────────────────────────────────────────────────────

async function handleListRecurring(userId: string): Promise<BotReply> {
  const rules = await adminData.findRecurringRules(userId)
  const active = rules.filter((r) => r.isActive)
  if (active.length === 0) return replies.noRecurring()

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const [transactions, categories] = await Promise.all([
    adminData.getMonthTransactions(userId, year, month),
    adminData.findCategories(userId),
  ])

  const due = pendingOccurrences(active, transactions, year, month, now)
  const dueByRule = new Map<string, string>()
  for (const occ of due) {
    if (!dueByRule.has(occ.rule.id)) dueByRule.set(occ.rule.id, dayKey(occ.date))
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Tanpa kategori'
  return replies.recurringList(active, dueByRule, categoryName)
}

async function handleSkipRecurring(userId: string, payload: string): Promise<BotReply> {
  const [ruleId, dk] = payload.split(':')
  if (!ruleId || !dk) return replies.genericError()

  const rules = await adminData.findRecurringRules(userId)
  const rule = rules.find((r) => r.id === ruleId)
  if (!rule || !rule.isActive) return replies.recurringSkipStale()

  // Re-validate against the current month rather than trusting the callback payload —
  // a tap on an old message could reference an occurrence that is no longer actually
  // due (already generated, already skipped, or the month has since rolled over).
  const now = new Date()
  const transactions = await adminData.getMonthTransactions(userId, now.getFullYear(), now.getMonth() + 1)
  const due = pendingOccurrences([rule], transactions, now.getFullYear(), now.getMonth() + 1, now)
  const stillDue = due.some((occ) => dayKey(occ.date) === dk)
  if (!stillDue) return replies.recurringSkipStale()

  await adminData.skipRecurringOccurrence(userId, ruleId, dk)
  return replies.recurringSkipped(rule.name)
}

// ─── /wishlist ───────────────────────────────────────────────────

async function handleListWishlist(userId: string): Promise<BotReply> {
  const items = await adminData.findWishlist(userId)
  const relevant = items.filter((i) => i.status !== 'purchased' && i.status !== 'cancelled')
  if (relevant.length === 0) return replies.noWishlist()

  const now = new Date()
  const context = await adminData.getFinancialContextAdmin(userId, now.getFullYear(), now.getMonth() + 1)
  const rows = relevant.map((item) => ({ item, result: analyseWishlistItem(item, context) }))
  return replies.wishlistList(rows)
}
