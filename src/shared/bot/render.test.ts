import { describe, expect, it } from 'vitest'
import { bar, moneyColumn, statusEmoji, trendArrow } from './render'

describe('bar', () => {
  it('fills proportionally and always has the requested width', () => {
    expect(bar(0, 10)).toBe('░░░░░░░░░░')
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(100, 10)).toBe('██████████')
  })

  it('clamps out-of-range values instead of overflowing the bar', () => {
    expect(bar(-20, 10)).toBe('░░░░░░░░░░')
    expect(bar(180, 10)).toBe('██████████')
  })
})

describe('trendArrow', () => {
  it('marks direction, and calls a near-zero change flat', () => {
    expect(trendArrow(12)).toBe('▲')
    expect(trendArrow(-12)).toBe('▼')
    expect(trendArrow(0.4)).toBe('▬')
  })
})

describe('statusEmoji', () => {
  it('maps every budget status', () => {
    expect(statusEmoji('safe')).toBe('🟢')
    expect(statusEmoji('warning')).toBe('🟡')
    expect(statusEmoji('danger')).toBe('🟠')
    expect(statusEmoji('exceeded')).toBe('🔴')
  })
})

describe('moneyColumn', () => {
  it('right-aligns every amount to the widest one', () => {
    const lines = moneyColumn([
      { label: 'Pemasukan', amount: 5_000_000 },
      { label: 'Terpakai', amount: 59_000 },
    ])
    const amounts = lines.map((l) => l.slice(l.indexOf('<code>')))
    expect(amounts[0].length).toBe(amounts[1].length)
  })
})
