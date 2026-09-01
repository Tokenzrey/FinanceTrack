import { repositories } from '@/shared/repositories'
import type { PillarConfig } from '@/shared/types/domain'

/** Rejects a split that does not sum to 100% — a silent 95% plan would misstate every ceiling. */
export async function updatePillarConfig(
  userId: string,
  year: number,
  month: number,
  config: PillarConfig,
): Promise<void> {
  const total = config.needs + config.wants + config.savings
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`Komposisi pilar harus 100%, saat ini ${Math.round(total * 100)}%`)
  }
  await repositories.budgets.upsert(userId, { year, month, pillarConfig: config })
}
