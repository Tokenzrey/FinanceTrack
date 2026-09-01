import { daysInMonth } from './budget-math'
import type { RecurringRule, Transaction } from '@/shared/types/domain'

/** Local calendar day key. Avoids the UTC shift `toISOString` causes in UTC+7. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Every date a rule falls due inside one month.
 *
 * A monthly rule set to the 31st still fires in February — the day is clamped to the
 * last day of the month rather than skipped, which is what a bill due "end of month"
 * actually means.
 */
export function occurrencesInMonth(rule: RecurringRule, year: number, month: number): Date[] {
  const total = daysInMonth(year, month)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month - 1, total)

  const start = startOfDay(rule.startDate.toDate())
  const end = rule.endDate ? startOfDay(rule.endDate.toDate()) : null

  // The rule has not begun yet, or already ended, before this month opens.
  if (start > monthEnd) return []
  if (end && end < monthStart) return []

  const within = (date: Date) => date >= start && (!end || date <= end)

  switch (rule.frequency) {
    case 'daily': {
      const dates: Date[] = []
      for (let day = 1; day <= total; day += 1) {
        const date = new Date(year, month - 1, day)
        if (within(date)) dates.push(date)
      }
      return dates
    }

    case 'weekly': {
      const target = rule.dayOfWeek ?? start.getDay()
      const dates: Date[] = []
      for (let day = 1; day <= total; day += 1) {
        const date = new Date(year, month - 1, day)
        if (date.getDay() === target && within(date)) dates.push(date)
      }
      return dates
    }

    case 'monthly': {
      const requested = rule.dayOfMonth ?? start.getDate()
      const date = new Date(year, month - 1, Math.min(requested, total))
      return within(date) ? [date] : []
    }

    case 'yearly': {
      // Fires only in the same calendar month the rule started in.
      if (start.getMonth() + 1 !== month) return []
      const requested = rule.dayOfMonth ?? start.getDate()
      const date = new Date(year, month - 1, Math.min(requested, total))
      return within(date) ? [date] : []
    }

    default:
      return []
  }
}

/** The next date this rule falls due on or after `from`. Null once it has ended. */
export function nextDueDate(rule: RecurringRule, from = new Date()): Date | null {
  if (!rule.isActive) return null

  const fromDay = startOfDay(from)
  let year = fromDay.getFullYear()
  let month = fromDay.getMonth() + 1

  // A yearly rule can be up to twelve months out; scan a little past that.
  for (let step = 0; step < 14; step += 1) {
    const upcoming = occurrencesInMonth(rule, year, month).find((date) => date >= fromDay)
    if (upcoming) return upcoming

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return null
}

export interface PendingOccurrence {
  rule: RecurringRule
  date: Date
}

/**
 * Occurrences due in a month that have no transaction yet.
 *
 * Matching is done against the transactions themselves — rule id plus calendar day —
 * rather than the rule's `lastGeneratedAt`. A transaction the user deleted by hand
 * should become due again, and a timestamp cursor would wrongly consider it handled.
 */
export function pendingOccurrences(
  rules: RecurringRule[],
  transactions: Transaction[],
  year: number,
  month: number,
  today = new Date(),
): PendingOccurrence[] {
  const generated = new Set(
    transactions
      .filter((tx) => tx.recurringRuleId)
      .map((tx) => `${tx.recurringRuleId}:${dayKey(tx.date.toDate())}`),
  )

  const cutoff = startOfDay(today)
  const pending: PendingOccurrence[] = []

  for (const rule of rules) {
    if (!rule.isActive) continue

    const skipped = new Set(rule.skippedDates ?? [])

    for (const date of occurrencesInMonth(rule, year, month)) {
      // Future occurrences are not yet owed; generating them would overstate spending.
      if (date > cutoff) continue
      if (skipped.has(dayKey(date))) continue
      if (generated.has(`${rule.id}:${dayKey(date)}`)) continue
      pending.push({ rule, date })
    }
  }

  return pending.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Total value of a month's rules, whether generated yet or not. */
export function monthlyCommitment(rules: RecurringRule[], year: number, month: number): number {
  return rules
    .filter((rule) => rule.isActive)
    .reduce((sum, rule) => sum + occurrencesInMonth(rule, year, month).length * rule.amount, 0)
}
