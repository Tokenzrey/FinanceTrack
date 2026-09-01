import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  EMPTY_FILTERS,
  collectTags,
  countActiveFilters,
  filterTransactions,
  hasActiveFilters,
} from './transaction-filters'
import type { Transaction } from '@/shared/types/domain'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  const date = overrides.date ?? Timestamp.fromDate(new Date(2026, 7, 15, 10, 0))
  return {
    id: Math.random().toString(36).slice(2),
    date,
    type: 'expense',
    pillar: 'needs',
    categoryId: 'cat-1',
    amount: 100_000,
    tags: [],
    isRecurring: false,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  }
}

const names = { 'cat-1': 'Makan', 'cat-2': 'Hiburan' }

describe('hasActiveFilters / countActiveFilters', () => {
  it('reports an untouched panel as inactive', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
  })

  it('counts each applied constraint', () => {
    const filters = { ...EMPTY_FILTERS, pillars: ['needs' as const], dateFrom: '2026-08-01' }
    expect(hasActiveFilters(filters)).toBe(true)
    expect(countActiveFilters(filters)).toBe(2)
  })

  it('treats search as active but does not count it as a chip', () => {
    const filters = { ...EMPTY_FILTERS, search: 'kopi' }
    expect(hasActiveFilters(filters)).toBe(true)
    expect(countActiveFilters(filters)).toBe(0)
  })
})

describe('filterTransactions', () => {
  const all = [
    tx({ id: 'a', description: 'Kopi pagi', location: 'Kopi Kenangan', tags: ['jajan'] }),
    tx({ id: 'b', categoryId: 'cat-2', pillar: 'wants', amount: 500_000, paymentMethod: 'qris' }),
    tx({ id: 'c', type: 'income', pillar: 'income', amount: 9_000_000, mood: 'happy' }),
    tx({ id: 'd', date: Timestamp.fromDate(new Date(2026, 7, 1)), tags: ['darurat', 'jajan'] }),
  ]

  it('returns everything when nothing is set', () => {
    expect(filterTransactions(all, EMPTY_FILTERS)).toHaveLength(4)
  })

  it('filters by type and pillar', () => {
    expect(
      filterTransactions(all, { ...EMPTY_FILTERS, types: ['income'] }).map((t) => t.id),
    ).toEqual(['c'])
    expect(
      filterTransactions(all, { ...EMPTY_FILTERS, pillars: ['wants'] }).map((t) => t.id),
    ).toEqual(['b'])
  })

  it('matches any selected tag, not all of them', () => {
    const result = filterTransactions(all, { ...EMPTY_FILTERS, tags: ['jajan'] })
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'd'])
  })

  it('excludes transactions missing an optional field the filter requires', () => {
    expect(filterTransactions(all, { ...EMPTY_FILTERS, paymentMethods: ['qris'] })).toHaveLength(1)
    expect(filterTransactions(all, { ...EMPTY_FILTERS, moods: ['happy'] })).toHaveLength(1)
  })

  it('applies inclusive date bounds on the local calendar day', () => {
    const result = filterTransactions(all, {
      ...EMPTY_FILTERS,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
    })
    expect(result.map((t) => t.id)).toEqual(['d'])
  })

  it('applies amount bounds', () => {
    expect(
      filterTransactions(all, { ...EMPTY_FILTERS, minAmount: 400_000, maxAmount: 1_000_000 }).map(
        (t) => t.id,
      ),
    ).toEqual(['b'])
  })

  it('searches description, location, tags and category name', () => {
    const search = (needle: string) =>
      filterTransactions(all, { ...EMPTY_FILTERS, search: needle }, names).map((t) => t.id)

    expect(search('kopi pagi')).toEqual(['a'])
    expect(search('kenangan')).toEqual(['a'])
    expect(search('darurat')).toEqual(['d'])
    expect(search('hiburan')).toEqual(['b'])
  })

  it('ignores case and surrounding whitespace in search', () => {
    expect(filterTransactions(all, { ...EMPTY_FILTERS, search: '  KOPI  ' }, names)).toHaveLength(1)
  })

  it('combines filters with AND', () => {
    const result = filterTransactions(all, {
      ...EMPTY_FILTERS,
      pillars: ['needs'],
      tags: ['jajan'],
      dateFrom: '2026-08-10',
    })
    expect(result.map((t) => t.id)).toEqual(['a'])
  })
})

describe('collectTags', () => {
  it('lists distinct tags, most used first', () => {
    const list = [
      tx({ tags: ['jajan'] }),
      tx({ tags: ['jajan', 'darurat'] }),
      tx({ tags: ['liburan'] }),
    ]
    expect(collectTags(list)[0]).toBe('jajan')
    expect(collectTags(list).sort()).toEqual(['darurat', 'jajan', 'liburan'])
  })
})
