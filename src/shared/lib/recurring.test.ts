import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  dayKey,
  monthlyCommitment,
  nextDueDate,
  occurrencesInMonth,
  pendingOccurrences,
} from './recurring'
import type { RecurringRule, Transaction } from '@/shared/types/domain'

const ts = (d: Date) => Timestamp.fromDate(d)

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    name: 'Langganan',
    type: 'expense',
    categoryId: 'cat-1',
    amount: 100_000,
    frequency: 'monthly',
    dayOfMonth: 5,
    startDate: ts(new Date(2026, 0, 1)),
    isActive: true,
    createdAt: ts(new Date(2026, 0, 1)),
    ...overrides,
  }
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  const date = overrides.date ?? ts(new Date(2026, 7, 5))
  return {
    id: Math.random().toString(36).slice(2),
    date,
    type: 'expense',
    pillar: 'needs',
    categoryId: 'cat-1',
    amount: 100_000,
    tags: [],
    isRecurring: true,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  }
}

describe('occurrencesInMonth', () => {
  it('returns one date for a monthly rule', () => {
    const dates = occurrencesInMonth(rule(), 2026, 8)
    expect(dates.map(dayKey)).toEqual(['2026-08-05'])
  })

  it('clamps a day-31 rule to the last day of a shorter month', () => {
    const dates = occurrencesInMonth(rule({ dayOfMonth: 31 }), 2026, 2)
    expect(dates.map(dayKey)).toEqual(['2026-02-28'])
  })

  it('returns every matching weekday for a weekly rule', () => {
    // August 2026 starts on a Saturday; Mondays fall on 3, 10, 17, 24, 31.
    const dates = occurrencesInMonth(rule({ frequency: 'weekly', dayOfWeek: 1 }), 2026, 8)
    expect(dates.map((d) => d.getDate())).toEqual([3, 10, 17, 24, 31])
  })

  it('returns every day of the month for a daily rule', () => {
    expect(occurrencesInMonth(rule({ frequency: 'daily' }), 2026, 8)).toHaveLength(31)
  })

  it('fires a yearly rule only in its starting month', () => {
    const yearly = rule({
      frequency: 'yearly',
      startDate: ts(new Date(2026, 2, 10)),
      dayOfMonth: 10,
    })
    expect(occurrencesInMonth(yearly, 2026, 3).map(dayKey)).toEqual(['2026-03-10'])
    expect(occurrencesInMonth(yearly, 2026, 8)).toEqual([])
  })

  it('ignores months before the rule starts or after it ends', () => {
    const bounded = rule({
      startDate: ts(new Date(2026, 5, 1)),
      endDate: ts(new Date(2026, 6, 31)),
    })
    expect(occurrencesInMonth(bounded, 2026, 5)).toEqual([])
    expect(occurrencesInMonth(bounded, 2026, 6).map(dayKey)).toEqual(['2026-06-05'])
    expect(occurrencesInMonth(bounded, 2026, 8)).toEqual([])
  })
})

describe('nextDueDate', () => {
  it('finds the next occurrence later this month', () => {
    expect(dayKey(nextDueDate(rule(), new Date(2026, 7, 1))!)).toBe('2026-08-05')
  })

  it('rolls into next month once this month has passed', () => {
    expect(dayKey(nextDueDate(rule(), new Date(2026, 7, 20))!)).toBe('2026-09-05')
  })

  it('crosses the year boundary', () => {
    expect(dayKey(nextDueDate(rule(), new Date(2026, 11, 20))!)).toBe('2027-01-05')
  })

  it('finds a yearly rule up to twelve months out', () => {
    const yearly = rule({
      frequency: 'yearly',
      startDate: ts(new Date(2026, 2, 10)),
      dayOfMonth: 10,
    })
    expect(dayKey(nextDueDate(yearly, new Date(2026, 7, 1))!)).toBe('2027-03-10')
  })

  it('returns null for an inactive or ended rule', () => {
    expect(nextDueDate(rule({ isActive: false }), new Date(2026, 7, 1))).toBeNull()
    expect(
      nextDueDate(rule({ endDate: ts(new Date(2026, 6, 1)) }), new Date(2026, 7, 1)),
    ).toBeNull()
  })
})

describe('pendingOccurrences', () => {
  const today = new Date(2026, 7, 20)

  it('reports an occurrence with no matching transaction', () => {
    const pending = pendingOccurrences([rule()], [], 2026, 8, today)
    expect(pending).toHaveLength(1)
    expect(dayKey(pending[0].date)).toBe('2026-08-05')
  })

  it('treats an occurrence as handled once its transaction exists', () => {
    const generated = tx({ recurringRuleId: 'rule-1', date: ts(new Date(2026, 7, 5)) })
    expect(pendingOccurrences([rule()], [generated], 2026, 8, today)).toEqual([])
  })

  it('does not count a manual transaction on the same day as generated', () => {
    const manual = tx({ date: ts(new Date(2026, 7, 5)), isRecurring: false })
    expect(pendingOccurrences([rule()], [manual], 2026, 8, today)).toHaveLength(1)
  })

  it('becomes due again after its transaction is deleted', () => {
    const before = pendingOccurrences(
      [rule()],
      [tx({ recurringRuleId: 'rule-1', date: ts(new Date(2026, 7, 5)) })],
      2026,
      8,
      today,
    )
    expect(before).toEqual([])
    // Same query with the transaction gone.
    expect(pendingOccurrences([rule()], [], 2026, 8, today)).toHaveLength(1)
  })

  it('leaves future occurrences alone', () => {
    const weekly = rule({ frequency: 'weekly', dayOfWeek: 1 })
    const pending = pendingOccurrences([weekly], [], 2026, 8, today)
    // Mondays 3, 10, 17 have passed; 24 and 31 have not.
    expect(pending.map((p) => p.date.getDate())).toEqual([3, 10, 17])
  })

  it('skips inactive rules', () => {
    expect(pendingOccurrences([rule({ isActive: false })], [], 2026, 8, today)).toEqual([])
  })

  it('sorts oldest first', () => {
    const daily = rule({ id: 'rule-daily', frequency: 'daily' })
    const pending = pendingOccurrences([rule(), daily], [], 2026, 8, today)
    expect(pending[0].date.getDate()).toBe(1)
  })
})

describe('monthlyCommitment', () => {
  it('multiplies amount by the number of occurrences', () => {
    const weekly = rule({ frequency: 'weekly', dayOfWeek: 1, amount: 50_000 })
    expect(monthlyCommitment([weekly], 2026, 8)).toBe(250_000)
  })

  it('sums across rules and ignores inactive ones', () => {
    expect(
      monthlyCommitment([rule(), rule({ id: 'r2', amount: 300_000, isActive: false })], 2026, 8),
    ).toBe(100_000)
  })
})

describe('skipped occurrences', () => {
  const today = new Date(2026, 7, 20)

  it('stops reporting a day the user skipped', () => {
    const skipped = rule({ skippedDates: ['2026-08-05'] })
    expect(pendingOccurrences([skipped], [], 2026, 8, today)).toEqual([])
  })

  it('skips only the named day, not the whole rule', () => {
    const weekly = rule({ frequency: 'weekly', dayOfWeek: 1, skippedDates: ['2026-08-10'] })
    const pending = pendingOccurrences([weekly], [], 2026, 8, today)
    expect(pending.map((p) => p.date.getDate())).toEqual([3, 17])
  })
})
