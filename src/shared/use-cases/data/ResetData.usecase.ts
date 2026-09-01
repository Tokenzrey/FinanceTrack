import { repositories } from '@/shared/repositories'
import type { ResetSummary } from '@/shared/types/domain'

/** Wipes every financial record for this account — categories, category items, budget
 *  templates (master data) and the profile/settings/Drive link (account) are untouched. */
export async function resetAllData(userId: string): Promise<ResetSummary> {
  return repositories.dataReset.resetAll(userId)
}

/** Wipes one month's records — see `IDataResetRepository.resetMonth` for exact scope. */
export async function resetMonthData(
  userId: string,
  year: number,
  month: number,
): Promise<ResetSummary> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Bulan tidak valid.')
  }
  return repositories.dataReset.resetMonth(userId, year, month)
}
