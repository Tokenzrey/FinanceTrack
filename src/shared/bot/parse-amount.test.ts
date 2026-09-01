import { describe, expect, it } from 'vitest'
import { parseAmount } from './parse-amount'

describe('parseAmount', () => {
  describe('shorthand suffixes', () => {
    it.each([
      ['35rb', 35_000],
      ['35 rb', 35_000],
      ['35k', 35_000],
      ['35ribu', 35_000],
      ['1.5jt', 1_500_000],
      ['1,5jt', 1_500_000],
      ['1.5 juta', 1_500_000],
      ['150k', 150_000],
    ])('parses "%s" as %d', (input, expected) => {
      expect(parseAmount(input)).toBe(expected)
    })

    it('reads the suffix inside a full sentence', () => {
      expect(parseAmount('bensin 150k kemarin')).toBe(150_000)
      expect(parseAmount('gaji masuk 5jt')).toBe(5_000_000)
    })
  })

  describe('plain Rupiah figures', () => {
    it.each([
      ['250.000', 250_000],
      ['250000', 250_000],
      ['Rp250.000', 250_000],
      ['Rp 250.000', 250_000],
      ['rp250000', 250_000],
    ])('parses "%s" as %d', (input, expected) => {
      expect(parseAmount(input)).toBe(expected)
    })
  })

  describe('largest-number heuristic', () => {
    it('ignores a leading quantity smaller than the price', () => {
      expect(parseAmount('beli 2 kopi 35000')).toBe(35_000)
    })

    it('ignores a two-digit quantity smaller than the price', () => {
      expect(parseAmount('beli 12 butir telur 15000')).toBe(15_000)
    })

    it('still works when the price appears before the quantity', () => {
      expect(parseAmount('35000 untuk 2 kopi')).toBe(35_000)
    })
  })

  describe('garbage input', () => {
    it.each([['abc'], [''], ['   '], ['0'], ['-50000'], ['minus 50000'], ['halo apa kabar']])(
      'rejects "%s"',
      (input) => {
        expect(parseAmount(input)).toBeNull()
      },
    )
  })
})
