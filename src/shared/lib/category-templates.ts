import type { CategoryIcon, Pillar, PillarConfig } from '@/shared/types/domain'
import { DEFAULT_PILLAR_CONFIG } from '@/shared/types/domain'

export interface CategoryTemplate {
  name: string
  pillar: Pillar
  /** Percent of total income, calibrated against the default 50/30/20 split. */
  percentOfIncome: number
  color: string
  icon: CategoryIcon
  isSinkingFund?: boolean
}

/**
 * Starter set for onboarding. Within each pillar the percentages add up to that pillar's
 * default share (needs 50, wants 30, savings 20), so a fresh plan is exactly 100% allocated.
 */
export const STARTER_CATEGORIES: CategoryTemplate[] = [
  { name: 'Gaji', pillar: 'income', percentOfIncome: 0, color: '#F59E0B', icon: 'dollar-sign' },

  { name: 'Tempat Tinggal', pillar: 'needs', percentOfIncome: 20, color: '#14B8A6', icon: 'home' },
  {
    name: 'Makan & Minum',
    pillar: 'needs',
    percentOfIncome: 15,
    color: '#0D9488',
    icon: 'utensils',
  },
  { name: 'Transportasi', pillar: 'needs', percentOfIncome: 7, color: '#0F766E', icon: 'car' },
  {
    name: 'Listrik & Internet',
    pillar: 'needs',
    percentOfIncome: 5,
    color: '#115E59',
    icon: 'zap',
  },
  { name: 'Kesehatan', pillar: 'needs', percentOfIncome: 3, color: '#134E4A', icon: 'heart' },

  {
    name: 'Kuliner & Nongkrong',
    pillar: 'wants',
    percentOfIncome: 9,
    color: '#F97316',
    icon: 'coffee',
  },
  { name: 'Hiburan', pillar: 'wants', percentOfIncome: 8, color: '#EA580C', icon: 'gamepad' },
  { name: 'Belanja', pillar: 'wants', percentOfIncome: 8, color: '#C2410C', icon: 'shopping-cart' },
  { name: 'Langganan', pillar: 'wants', percentOfIncome: 5, color: '#9A3412', icon: 'music' },

  {
    name: 'Dana Darurat',
    pillar: 'savings',
    percentOfIncome: 10,
    color: '#8B5CF6',
    icon: 'shield',
    isSinkingFund: true,
  },
  {
    name: 'Investasi',
    pillar: 'savings',
    percentOfIncome: 7,
    color: '#7C3AED',
    icon: 'trending-up',
  },
  {
    name: 'Target Tabungan',
    pillar: 'savings',
    percentOfIncome: 3,
    color: '#6D28D9',
    icon: 'star',
    isSinkingFund: true,
  },
]

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Rescales the starter percentages to a custom pillar split.
 * With a 60/20/20 plan, every "needs" category grows by 60/50 so the pillar still
 * adds up — otherwise a custom split would leave the plan under- or over-allocated.
 *
 * Rounding each category to one decimal drifts (a 20% "wants" pillar lands on 19.9),
 * so the leftover is handed to the largest category in the pillar and the pillar totals
 * exactly its share. Only pillars present in `templates` are balanced — a user who
 * deselects half the starter set gets what they picked, not a silently padded plan.
 */
export function scaleTemplates(
  templates: CategoryTemplate[],
  config: PillarConfig,
): CategoryTemplate[] {
  const ratio: Record<Pillar, number> = {
    income: 1,
    needs: config.needs / DEFAULT_PILLAR_CONFIG.needs,
    wants: config.wants / DEFAULT_PILLAR_CONFIG.wants,
    savings: config.savings / DEFAULT_PILLAR_CONFIG.savings,
  }

  const scaled = templates.map((template) => ({
    ...template,
    percentOfIncome: round1(template.percentOfIncome * ratio[template.pillar]),
  }))

  for (const pillar of ['needs', 'wants', 'savings'] as const) {
    const inPillar = scaled.filter((t) => t.pillar === pillar)
    if (inPillar.length === 0) continue

    // The unrounded target for the categories actually kept.
    const target = round1(
      templates
        .filter((t) => t.pillar === pillar)
        .reduce((sum, t) => sum + t.percentOfIncome * ratio[pillar], 0),
    )
    const actual = inPillar.reduce((sum, t) => sum + t.percentOfIncome, 0)
    const drift = round1(target - actual)
    if (drift === 0) continue

    const largest = inPillar.reduce((max, t) => (t.percentOfIncome > max.percentOfIncome ? t : max))
    largest.percentOfIncome = round1(largest.percentOfIncome + drift)
  }

  return scaled
}
