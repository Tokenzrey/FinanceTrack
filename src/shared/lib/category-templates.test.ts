import { describe, expect, it } from 'vitest'
import { STARTER_CATEGORIES, scaleTemplates } from './category-templates'
import { DEFAULT_PILLAR_CONFIG, type Pillar } from '@/shared/types/domain'

function pillarTotal(templates: typeof STARTER_CATEGORIES, pillar: Pillar): number {
  return templates.filter((t) => t.pillar === pillar).reduce((sum, t) => sum + t.percentOfIncome, 0)
}

describe('STARTER_CATEGORIES', () => {
  it('allocates each pillar to exactly its 50/30/20 share', () => {
    expect(pillarTotal(STARTER_CATEGORIES, 'needs')).toBe(50)
    expect(pillarTotal(STARTER_CATEGORIES, 'wants')).toBe(30)
    expect(pillarTotal(STARTER_CATEGORIES, 'savings')).toBe(20)
  })
})

describe('scaleTemplates', () => {
  it('leaves the defaults untouched', () => {
    const scaled = scaleTemplates(STARTER_CATEGORIES, DEFAULT_PILLAR_CONFIG)
    expect(pillarTotal(scaled, 'needs')).toBe(50)
    expect(pillarTotal(scaled, 'wants')).toBe(30)
    expect(pillarTotal(scaled, 'savings')).toBe(20)
  })

  it('keeps each pillar fully allocated under a custom split', () => {
    const scaled = scaleTemplates(STARTER_CATEGORIES, { needs: 0.6, wants: 0.2, savings: 0.2 })
    expect(pillarTotal(scaled, 'needs')).toBeCloseTo(60, 1)
    expect(pillarTotal(scaled, 'wants')).toBeCloseTo(20, 1)
    expect(pillarTotal(scaled, 'savings')).toBeCloseTo(20, 1)
  })

  it('never rescales income categories', () => {
    const scaled = scaleTemplates(STARTER_CATEGORIES, { needs: 0.7, wants: 0.1, savings: 0.2 })
    const income = scaled.filter((t) => t.pillar === 'income')
    expect(income).toHaveLength(1)
    expect(income[0].percentOfIncome).toBe(0)
  })

  it('scales a subset the user selected, not the whole set', () => {
    const subset = STARTER_CATEGORIES.filter((t) => t.pillar === 'savings')
    const scaled = scaleTemplates(subset, { needs: 0.5, wants: 0.2, savings: 0.3 })
    expect(scaled).toHaveLength(subset.length)
    expect(pillarTotal(scaled, 'savings')).toBeCloseTo(30, 1)
  })
})
