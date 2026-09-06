import { projectSavings } from '@/shared/lib/analytics'
import { buildMonthlySummary } from '@/shared/lib/budget-math'
import { dayKeyInTz, formatDayLong, formatIDR, formatMonthLong } from '@/shared/lib/format'
import { configureRouterIO } from '@/shared/lib/gemini-router'
import { dayKey, pendingOccurrences } from '@/shared/lib/recurring'
import { buildYearSummary } from '@/shared/lib/year-summary'
import { DEFAULT_PILLAR_CONFIG } from '@/shared/types/domain'
import { analyseWishlistItem } from '@/shared/use-cases/wishlist/CalculateAffordability.usecase'
import * as adminData from './admin-data'
import type { BotPendingDraft } from './admin-data'
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

  const prefsCommand = parsePrefsCommand(trimmed)
  if (prefsCommand.kind !== 'none') {
    if (prefsCommand.kind === 'invalid') return replies.prefsInvalid(prefsCommand.field)
    if (prefsCommand.kind === 'show') return replies.prefsCard(await adminData.getBotPrefs(userId))
    return replies.prefsUpdated(await adminData.saveBotPrefs(userId, prefsCommand.patch))
  }

  // `/cari kopi` carries an argument, so it cannot be a bare read-command match.
  const search = trimmed.match(/^\/?(?:cari|search)\s+(.+)$/i)
  if (search) return handleSearch(userId, search[1].trim())

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

  if (intent === 'get_recent') {
    const [transactions, categories] = await Promise.all([
      adminData.getRecentTransactions(userId, 5),
      adminData.findCategories(userId),
    ])
    return replies.recentTransactions(transactions, categories)
  }

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

  // get_summary / get_balance both need the full monthly summary.
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

  return intent === 'get_summary' ? replies.summary(summary) : replies.balance(summary)
}

// ─── /undo, /cari, /hariini, /minggu, /statistik ────────────────

async function handleUndo(userId: string): Promise<BotReply> {
  const last = await adminData.getLastBatch(userId)
  if (!last) return replies.nothingToUndo()
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

  const top = [...summary.categories]
    .sort((a, b) => b.used - a.used)
    .slice(0, 5)
    .map((c) => ({ name: c.category.name, amount: c.used }))

  const projected = summary.categories.reduce((sum, c) => sum + c.projectedMonthEnd, 0)
  return replies.stats(formatMonthLong(year, month), summary.dailyAvgSpend, projected, top)
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
