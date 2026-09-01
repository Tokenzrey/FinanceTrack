import type {
  PaymentMethod,
  Pillar,
  SpendingMood,
  Transaction,
  TransactionType,
} from '@/shared/types/domain'

export interface TransactionFilterState {
  search: string
  types: TransactionType[]
  pillars: Pillar[]
  categoryIds: string[]
  paymentMethods: PaymentMethod[]
  moods: SpendingMood[]
  tags: string[]
  /** Inclusive date bounds, as yyyy-MM-dd strings from native date inputs. */
  dateFrom: string
  dateTo: string
  minAmount: number | null
  maxAmount: number | null
}

export const EMPTY_FILTERS: TransactionFilterState = {
  search: '',
  types: [],
  pillars: [],
  categoryIds: [],
  paymentMethods: [],
  moods: [],
  tags: [],
  dateFrom: '',
  dateTo: '',
  minAmount: null,
  maxAmount: null,
}

export function hasActiveFilters(filters: TransactionFilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.types.length > 0 ||
    filters.pillars.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.paymentMethods.length > 0 ||
    filters.moods.length > 0 ||
    filters.tags.length > 0 ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.minAmount !== null ||
    filters.maxAmount !== null
  )
}

export function countActiveFilters(filters: TransactionFilterState): number {
  return (
    filters.types.length +
    filters.pillars.length +
    filters.categoryIds.length +
    filters.paymentMethods.length +
    filters.moods.length +
    filters.tags.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.minAmount !== null ? 1 : 0) +
    (filters.maxAmount !== null ? 1 : 0)
  )
}

/** Local calendar day as yyyy-MM-dd. `toISOString` would shift the day in UTC+7. */
function toDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Applies every active filter. An empty array means "no constraint", not "match nothing",
 * so an untouched filter panel returns the full list.
 *
 * Search covers description, location and tags — the three free-text fields a user
 * would think to search by.
 */
export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilterState,
  /** Category id → name, so search can match a category by name too. */
  categoryNames: Record<string, string> = {},
): Transaction[] {
  const needle = filters.search.trim().toLowerCase()

  return transactions.filter((tx) => {
    if (filters.types.length > 0 && !filters.types.includes(tx.type)) return false
    if (filters.pillars.length > 0 && !filters.pillars.includes(tx.pillar)) return false
    if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(tx.categoryId)) return false

    if (filters.paymentMethods.length > 0) {
      if (!tx.paymentMethod || !filters.paymentMethods.includes(tx.paymentMethod)) return false
    }

    if (filters.moods.length > 0) {
      if (!tx.mood || !filters.moods.includes(tx.mood)) return false
    }

    // Tag filter is OR within tags: a transaction matches if it carries any selected tag.
    if (filters.tags.length > 0 && !filters.tags.some((tag) => tx.tags.includes(tag))) return false

    if (filters.minAmount !== null && tx.amount < filters.minAmount) return false
    if (filters.maxAmount !== null && tx.amount > filters.maxAmount) return false

    if (filters.dateFrom || filters.dateTo) {
      const day = toDayKey(tx.date.toDate())
      if (filters.dateFrom && day < filters.dateFrom) return false
      if (filters.dateTo && day > filters.dateTo) return false
    }

    if (needle) {
      const haystack = [
        tx.description ?? '',
        tx.location ?? '',
        categoryNames[tx.categoryId] ?? '',
        ...tx.tags,
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })
}

/** Every distinct tag in the given transactions, most used first. */
export function collectTags(transactions: Transaction[]): string[] {
  const counts = new Map<string, number>()
  for (const tx of transactions) {
    for (const tag of tx.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
}
