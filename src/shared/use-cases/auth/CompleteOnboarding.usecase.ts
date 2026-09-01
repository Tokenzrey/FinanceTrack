import { repositories } from '@/shared/repositories'
import { scaleTemplates, type CategoryTemplate } from '@/shared/lib/category-templates'
import type { PillarConfig } from '@/shared/types/domain'

export interface CompleteOnboardingInput {
  displayName: string
  monthlyIncome: number
  pillarConfig: PillarConfig
  templates: CategoryTemplate[]
}

/**
 * Final onboarding step. Writes the profile, this month's budget and the starter
 * categories, then flips `onboardingCompleted` — which is what the auth guard checks.
 *
 * The flag is set last on purpose: if any earlier write fails the user is sent back
 * through onboarding rather than landing on a dashboard with no categories.
 */
export async function completeOnboarding(
  userId: string,
  input: CompleteOnboardingInput,
): Promise<void> {
  const total = input.pillarConfig.needs + input.pillarConfig.wants + input.pillarConfig.savings
  if (Math.abs(total - 1) > 0.001) {
    throw new Error('Komposisi pilar harus berjumlah 100%')
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  await repositories.budgets.upsert(userId, {
    year,
    month,
    totalIncome: input.monthlyIncome,
    pillarConfig: input.pillarConfig,
    categoryOverrides: [],
  })

  const scaled = scaleTemplates(input.templates, input.pillarConfig)
  // Sequential rather than parallel: `order` must follow the template order.
  for (const [index, template] of scaled.entries()) {
    await repositories.categories.create(userId, {
      name: template.name,
      pillar: template.pillar,
      percentOfIncome: template.percentOfIncome,
      color: template.color,
      icon: template.icon,
      isSinkingFund: template.isSinkingFund ?? false,
      order: index,
    })
  }

  await repositories.users.updateProfile(userId, {
    displayName: input.displayName.trim(),
    onboardingCompleted: true,
  })
}
