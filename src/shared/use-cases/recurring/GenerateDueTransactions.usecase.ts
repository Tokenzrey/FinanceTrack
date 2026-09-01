import { repositories } from '@/shared/repositories'
import { dayKey, pendingOccurrences, type PendingOccurrence } from '@/shared/lib/recurring'
import { isMonthClosed } from '@/shared/lib/month-lock'
import type { CreateTransactionDTO } from '@/shared/types/dto'

/** Occurrences owed in a month, newest state of the ledger considered. */
export async function findDueOccurrences(
  userId: string,
  year: number,
  month: number,
  today = new Date(),
): Promise<PendingOccurrence[]> {
  const [rules, transactions] = await Promise.all([
    repositories.recurring.findActive(userId),
    repositories.transactions.findByMonth(userId, year, month),
  ])

  return pendingOccurrences(rules, transactions, year, month, today)
}

/**
 * Writes a transaction for each owed occurrence.
 *
 * Re-checks what is pending immediately before writing, rather than trusting a list the
 * UI may have been holding for minutes — otherwise two open tabs, or a slow confirm
 * dialog, would produce the same bill twice.
 */
export interface GenerateDueTransactionsResult {
  created: number
  /** Occurrences whose target month is closed — skipped rather than blocking the batch. */
  skippedClosedMonth: number
}

export async function generateDueTransactions(
  userId: string,
  year: number,
  month: number,
  options: { ruleIds?: string[]; today?: Date } = {},
): Promise<GenerateDueTransactionsResult> {
  const { ruleIds, today = new Date() } = options

  const due = (await findDueOccurrences(userId, year, month, today)).filter(
    (occurrence) => !ruleIds || ruleIds.includes(occurrence.rule.id),
  )

  if (due.length === 0) return { created: 0, skippedClosedMonth: 0 }

  const categories = await repositories.categories.findAll(userId)

  const drafts: CreateTransactionDTO[] = []
  let skippedClosedMonth = 0
  for (const { rule, date } of due) {
    const category = categories.find((c) => c.id === rule.categoryId)
    // A rule pointing at a deleted category cannot be filed anywhere sensible.
    if (!category) continue

    // A skip rule can span into a neighbouring month (weekly rules near month-end);
    // guard each occurrence's own month, not just the batch's nominal month.
    if (await isMonthClosed(userId, date)) {
      skippedClosedMonth += 1
      continue
    }

    drafts.push({
      date,
      type: rule.type,
      pillar: category.pillar,
      categoryId: rule.categoryId,
      categoryItemId: rule.categoryItemId,
      amount: rule.amount,
      description: rule.name,
      paymentMethod: rule.paymentMethod,
      tags: ['rutin'],
      isRecurring: true,
      recurringRuleId: rule.id,
    })
  }

  if (drafts.length === 0) return { created: 0, skippedClosedMonth }

  await repositories.transactions.bulkCreate(userId, drafts)

  // Only rules that actually got a transaction written count as "generated" —
  // a rule whose sole due occurrence was skipped (closed month) must stay pending.
  const generatedDates = new Set(drafts.map((draft) => `${draft.recurringRuleId}`))
  const touched = new Set(
    due
      .filter((occurrence) => generatedDates.has(occurrence.rule.id))
      .map((occurrence) => occurrence.rule.id),
  )
  await Promise.all(
    [...touched].map((ruleId) => repositories.recurring.markGenerated(userId, ruleId, today)),
  )

  return { created: drafts.length, skippedClosedMonth }
}

/**
 * Skips one occurrence without touching the rule.
 *
 * The skipped day is recorded on the rule itself rather than as a zero-amount
 * transaction — a fake ledger row would show up in the transaction list and in exports.
 */
export async function skipRecurringOccurrence(
  userId: string,
  ruleId: string,
  date: Date,
): Promise<void> {
  await repositories.recurring.skipOccurrence(userId, ruleId, dayKey(date))
}
