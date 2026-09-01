import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Category } from '@/shared/types/domain'
import type { Wishlist } from '@/shared/types/wishlist.types'

/**
 * Repositories are mocked so the use case can be exercised without Firestore. What is
 * under test is the contract the plan's verification names: a real expense lands in the
 * ledger, and the item moves to `purchased` linked to that transaction.
 */
const findById = vi.fn()
const createTransaction = vi.fn()
const markPurchased = vi.fn()
// The use case now guards against a closed month; a null budget means "not closed".
const findBudget = vi.fn().mockResolvedValue(null)

vi.mock('@/shared/repositories', () => ({
  repositories: {
    categories: { findById: (...args: unknown[]) => findById(...args) },
    transactions: { create: (...args: unknown[]) => createTransaction(...args) },
    wishlist: { markPurchased: (...args: unknown[]) => markPurchased(...args) },
    budgets: { find: (...args: unknown[]) => findBudget(...args) },
  },
}))

const { markWishlistAsPurchased } = await import('./MarkAsPurchased.usecase')

const ts = (d: Date) => Timestamp.fromDate(d)

const category: Category = {
  id: 'cat-elektronik',
  name: 'Elektronik',
  pillar: 'wants',
  percentOfIncome: 10,
  color: '#F97316',
  icon: 'laptop',
  isSinkingFund: false,
  isRecurring: false,
  isActive: true,
  order: 0,
  createdAt: ts(new Date(2026, 7, 1)),
  updatedAt: ts(new Date(2026, 7, 1)),
}

function item(overrides: Partial<Wishlist> = {}): Wishlist {
  return {
    id: 'wish-1',
    name: 'iPhone 16',
    estimatedPrice: 16_000_000,
    priority: 'high',
    status: 'ready_to_buy',
    justification: 'want',
    financingMethod: 'cash',
    createdAt: ts(new Date(2026, 7, 1)),
    updatedAt: ts(new Date(2026, 7, 1)),
    ...overrides,
  }
}

beforeEach(() => {
  findById.mockReset().mockResolvedValue(category)
  createTransaction.mockReset().mockResolvedValue({ id: 'tx-99' })
  markPurchased.mockReset().mockResolvedValue(undefined)
  findBudget.mockReset().mockResolvedValue(null)
})

describe('markWishlistAsPurchased', () => {
  it('writes the actual price to the ledger, not the estimate', async () => {
    // The plan's scenario: estimated 16jt, actually paid 15,8jt.
    await markWishlistAsPurchased('user-1', item(), {
      actualPrice: 15_800_000,
      categoryId: 'cat-elektronik',
      date: new Date(2026, 7, 20),
    })

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const [, draft] = createTransaction.mock.calls[0]
    expect(draft).toMatchObject({
      type: 'expense',
      amount: 15_800_000,
      categoryId: 'cat-elektronik',
      description: 'iPhone 16',
      tags: ['wishlist'],
    })
  })

  it('files the expense under the category’s own pillar', async () => {
    await markWishlistAsPurchased('user-1', item(), {
      actualPrice: 15_800_000,
      categoryId: 'cat-elektronik',
    })
    expect(createTransaction.mock.calls[0][1]).toMatchObject({ pillar: 'wants' })
  })

  it('moves the item to purchased and links the transaction', async () => {
    const transactionId = await markWishlistAsPurchased('user-1', item(), {
      actualPrice: 15_800_000,
      categoryId: 'cat-elektronik',
    })

    expect(transactionId).toBe('tx-99')
    expect(markPurchased).toHaveBeenCalledWith('user-1', 'wish-1', 15_800_000, 'tx-99')
  })

  it('creates the transaction before flipping the status', async () => {
    const order: string[] = []
    createTransaction.mockImplementation(async () => {
      order.push('transaction')
      return { id: 'tx-99' }
    })
    markPurchased.mockImplementation(async () => {
      order.push('status')
    })

    await markWishlistAsPurchased('user-1', item(), {
      actualPrice: 1_000_000,
      categoryId: 'cat-elektronik',
    })

    expect(order).toEqual(['transaction', 'status'])
  })

  it('leaves the item un-purchased when the ledger write fails', async () => {
    createTransaction.mockRejectedValue(new Error('Firestore offline'))

    await expect(
      markWishlistAsPurchased('user-1', item(), {
        actualPrice: 1_000_000,
        categoryId: 'cat-elektronik',
      }),
    ).rejects.toThrow('Firestore offline')

    expect(markPurchased).not.toHaveBeenCalled()
  })

  it('rejects a non-positive price', async () => {
    await expect(
      markWishlistAsPurchased('user-1', item(), { actualPrice: 0, categoryId: 'cat-elektronik' }),
    ).rejects.toThrow(/lebih dari nol/)
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('refuses to double-record an already purchased item', async () => {
    await expect(
      markWishlistAsPurchased('user-1', item({ status: 'purchased' }), {
        actualPrice: 1_000_000,
        categoryId: 'cat-elektronik',
      }),
    ).rejects.toThrow(/sudah ditandai dibeli/)
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('rejects a missing or archived category', async () => {
    findById.mockResolvedValue(null)
    await expect(
      markWishlistAsPurchased('user-1', item(), { actualPrice: 1, categoryId: 'gone' }),
    ).rejects.toThrow(/Kategori tidak ditemukan/)

    findById.mockResolvedValue({ ...category, isActive: false })
    await expect(
      markWishlistAsPurchased('user-1', item(), { actualPrice: 1, categoryId: 'archived' }),
    ).rejects.toThrow(/Kategori tidak ditemukan/)
  })
})
