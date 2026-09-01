import { repositories } from '@/shared/repositories'

export class MonthClosedError extends Error {
  constructor(
    readonly year: number,
    readonly month: number,
  ) {
    super(
      `Bulan ${String(month).padStart(2, '0')}/${year} sudah ditutup. Buka kembali dari Pengaturan untuk mengubahnya.`,
    )
    this.name = 'MonthClosedError'
  }
}

/**
 * Throws when the month a date falls in has been closed via "Tutup Bulan".
 *
 * This is the single guard every write path routes through — AddTransaction,
 * EditTransaction, delete (single + bulk), recurring generation, and marking a
 * wishlist item purchased — so "closed" means something everywhere at once instead of
 * being a label the Transactions page happens to ignore.
 */
export async function assertMonthOpen(userId: string, date: Date): Promise<void> {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const budget = await repositories.budgets.find(userId, year, month)
  if (budget?.closedAt) throw new MonthClosedError(year, month)
}

/** True/false version for call sites that want to skip rather than throw (e.g. batch generation). */
export async function isMonthClosed(userId: string, date: Date): Promise<boolean> {
  const budget = await repositories.budgets.find(
    userId,
    date.getFullYear(),
    date.getMonth() + 1,
  )
  return Boolean(budget?.closedAt)
}
