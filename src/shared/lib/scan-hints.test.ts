import { describe, expect, it } from 'vitest'
import { applyCorrections, hintsForItems, keywordFor } from './scan-hints'
import type { CategoryHint } from '@/shared/types/receipt-scanner.types'

describe('keywordFor', () => {
  it('keeps the leading brand token', () => {
    expect(keywordFor('Indomie Goreng x3')).toBe('indomie')
    expect(keywordFor('AQUA 600ML')).toBe('aqua')
    expect(keywordFor('Sunlight 800ml Refill')).toBe('sunlight')
  })

  it('drops units, counts and punctuation', () => {
    expect(keywordFor('2 pcs Royco Sapi')).toBe('royco')
    expect(keywordFor('1kg Gula Pasir')).toBe('gula')
    expect(keywordFor('*** BERAS 5KG ***')).toBe('beras')
  })

  it('returns an empty keyword when nothing meaningful is left', () => {
    expect(keywordFor('600 ml')).toBe('')
    expect(keywordFor('---')).toBe('')
    expect(keywordFor('')).toBe('')
  })
})

describe('applyCorrections', () => {
  it('records a new keyword the first time', () => {
    const hints = applyCorrections(
      [],
      [{ itemName: 'Indomie Goreng', categoryId: 'cat-food' }],
      1000,
    )
    expect(hints).toEqual([
      { keyword: 'indomie', categoryId: 'cat-food', frequency: 1, updatedAt: 1000 },
    ])
  })

  it('increments frequency when the same pairing is confirmed again', () => {
    const first = applyCorrections([], [{ itemName: 'Indomie', categoryId: 'cat-food' }], 1000)
    const second = applyCorrections(
      first,
      [{ itemName: 'Indomie Goreng x2', categoryId: 'cat-food' }],
      2000,
    )
    expect(second[0].frequency).toBe(2)
    expect(second[0].updatedAt).toBe(2000)
  })

  it('resets the count when a keyword is re-filed elsewhere', () => {
    const first = applyCorrections(
      [],
      [
        { itemName: 'Indomie', categoryId: 'cat-kuliner' },
        { itemName: 'Indomie', categoryId: 'cat-kuliner' },
      ],
      1000,
    )
    expect(first[0].frequency).toBe(2)

    const moved = applyCorrections(first, [{ itemName: 'Indomie', categoryId: 'cat-food' }], 2000)
    expect(moved).toHaveLength(1)
    expect(moved[0].categoryId).toBe('cat-food')
    expect(moved[0].frequency).toBe(1)
  })

  it('ignores corrections with no usable keyword or no category', () => {
    const hints = applyCorrections(
      [],
      [
        { itemName: '600 ml', categoryId: 'cat-food' },
        { itemName: 'Aqua', categoryId: '' },
      ],
      1000,
    )
    expect(hints).toEqual([])
  })

  it('orders the most confirmed pairings first', () => {
    const hints = applyCorrections(
      [],
      [
        { itemName: 'Aqua', categoryId: 'cat-food' },
        { itemName: 'Indomie', categoryId: 'cat-food' },
        { itemName: 'Indomie', categoryId: 'cat-food' },
      ],
      1000,
    )
    expect(hints[0].keyword).toBe('indomie')
  })
})

describe('hintsForItems', () => {
  const hints: CategoryHint[] = [
    { keyword: 'indomie', categoryId: 'cat-food', frequency: 3, updatedAt: 1 },
    { keyword: 'bensin', categoryId: 'cat-transport', frequency: 2, updatedAt: 1 },
  ]

  it('returns only hints matching the receipt at hand', () => {
    const result = hintsForItems(hints, ['Indomie Goreng x3', 'Telur 1kg'])
    expect(result.map((h) => h.keyword)).toEqual(['indomie'])
  })

  it('returns nothing when no item matches', () => {
    expect(hintsForItems(hints, ['Sabun Lifebuoy'])).toEqual([])
  })
})
