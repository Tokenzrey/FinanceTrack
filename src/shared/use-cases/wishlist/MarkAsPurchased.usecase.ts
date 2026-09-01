import { repositories } from '@/shared/repositories'
import { assertMonthOpen } from '@/shared/lib/month-lock'
import type { Wishlist } from '@/shared/types/wishlist.types'

export interface MarkAsPurchasedInput {
  /** What was actually paid, which often differs from the estimate. */
  actualPrice: number
  categoryId: string
  date?: Date
  paymentMethodNote?: string
}

/**
 * Completes a wishlist item by writing the real expense into the main ledger.
 *
 * The transaction is created first and its id stored on the wishlist item: if the
 * ledger write fails, the item stays un-purchased rather than being marked bought with
 * no matching expense — the failure mode that would silently understate spending.
 */
export async function markWishlistAsPurchased(
  userId: string,
  item: Wishlist,
  input: MarkAsPurchasedInput,
): Promise<string> {
  if (input.actualPrice <= 0) {
    throw new Error('Harga pembelian harus lebih dari nol')
  }
  if (item.status === 'purchased') {
    throw new Error('Item ini sudah ditandai dibeli')
  }

  const category = await repositories.categories.findById(userId, input.categoryId)
  if (!category || !category.isActive) {
    throw new Error('Kategori tidak ditemukan')
  }

  const date = input.date ?? new Date()
  await assertMonthOpen(userId, date)

  const transaction = await repositories.transactions.create(userId, {
    date,
    type: 'expense',
    pillar: category.pillar,
    categoryId: input.categoryId,
    amount: input.actualPrice,
    description: item.name,
    tags: ['wishlist'],
  })

  await repositories.wishlist.markPurchased(userId, item.id, input.actualPrice, transaction.id)

  return transaction.id
}
