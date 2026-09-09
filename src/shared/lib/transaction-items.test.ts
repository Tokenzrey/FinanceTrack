import { describe, expect, it } from 'vitest'

import {
  deriveTransactionTitle,
  itemsSubtotal,
  reconcileToTotal,
  sanitizeItems,
} from './transaction-items'

describe('deriveTransactionTitle', () => {
  it('uses the stored title verbatim when present', () => {
    expect(deriveTransactionTitle({ title: 'Belanja Superindo', description: 'x' })).toBe(
      'Belanja Superindo',
    )
  })

  it('falls back to the description, trimmed at a word boundary near 48 chars', () => {
    const long =
      'beli kopi susu gula teh roti selai mentega telur minyak garam untuk stok dapur bulan ini'
    const title = deriveTransactionTitle({ description: long })
    expect(title.length).toBeLessThanOrEqual(49)
    expect(long.startsWith(title.replace(/…$/, ''))).toBe(true)
    expect(title.endsWith('…')).toBe(true)
  })

  it('returns a short description whole, no ellipsis', () => {
    expect(deriveTransactionTitle({ description: 'Jajan sore' })).toBe('Jajan sore')
  })

  it('is empty when there is nothing to derive from', () => {
    expect(deriveTransactionTitle({})).toBe('')
    expect(deriveTransactionTitle({ description: '   ' })).toBe('')
  })
})

describe('sanitizeItems', () => {
  it('trims names, coerces numbers, drops rows with a blank name', () => {
    expect(
      sanitizeItems([
        { name: '  Cimory UHT ', qty: 2, price: 16400 },
        { name: '', qty: 1, price: 5000 },
        { name: 'Roti', qty: 0, price: -3 },
      ]),
    ).toEqual([
      { name: 'Cimory UHT', qty: 2, price: 16400 },
      { name: 'Roti', qty: 1, price: 0 },
    ])
  })

  it('accepts string-y numbers from a form and floors qty to a whole ≥ 1', () => {
    expect(
      sanitizeItems([{ name: 'A', qty: 2.7 as unknown as number, price: '8200' as unknown as number }]),
    ).toEqual([{ name: 'A', qty: 2, price: 8200 }])
  })

  it('returns [] for null / undefined / non-array', () => {
    expect(sanitizeItems(undefined)).toEqual([])
    expect(sanitizeItems(null as never)).toEqual([])
  })
})

describe('itemsSubtotal', () => {
  it('sums line prices', () => {
    expect(
      itemsSubtotal([
        { name: 'A', qty: 1, price: 8200 },
        { name: 'B', qty: 3, price: 15000 },
      ]),
    ).toBe(23200)
  })
  it('is 0 for an empty list', () => {
    expect(itemsSubtotal([])).toBe(0)
  })
})

describe('reconcileToTotal', () => {
  const items = [
    { name: 'A', qty: 1, price: 10000 },
    { name: 'B', qty: 1, price: 30000 },
  ] // subtotal 40000

  it('returns items untouched when subtotal already matches the target', () => {
    expect(reconcileToTotal(items, 40000)).toEqual(items)
  })

  it('scales line prices proportionally to hit the target', () => {
    const out = reconcileToTotal(items, 44000) // +10%
    expect(out.map((i) => i.price)).toEqual([11000, 33000])
    expect(out.reduce((s, i) => s + i.price, 0)).toBe(44000)
  })

  it('puts any rounding remainder on the last line so the sum is exact', () => {
    const out = reconcileToTotal(
      [
        { name: 'A', qty: 1, price: 3 },
        { name: 'B', qty: 1, price: 3 },
        { name: 'C', qty: 1, price: 3 },
      ],
      10,
    )
    expect(out.reduce((s, i) => s + i.price, 0)).toBe(10)
  })

  it('leaves an empty list alone', () => {
    expect(reconcileToTotal([], 5000)).toEqual([])
  })

  it('does not scale when the target is 0 or negative', () => {
    expect(reconcileToTotal(items, 0)).toEqual(items)
  })
})
