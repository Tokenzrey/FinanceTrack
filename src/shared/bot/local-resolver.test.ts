import { describe, expect, it } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { CategoryHint } from '@/shared/types/receipt-scanner.types'
import { detectDateOffset, detectType, resolveLocally, splitSegments, tryLocalBatch } from './local-resolver'

const NOW = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar, percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}

const CATEGORIES = [
  cat('c-food', 'Makan & Minum', 'needs'),
  cat('c-transport', 'Transportasi', 'needs'),
  cat('c-salary', 'Gaji', 'income'),
]

const hint = (keyword: string, categoryId: string, frequency: number): CategoryHint => ({
  keyword, categoryId, frequency, updatedAt: Date.now(),
})

describe('resolveLocally', () => {
  it('matches a category by its own name appearing in the message', () => {
    const match = resolveLocally('bayar transportasi 50rb', CATEGORIES, [])
    expect(match?.categoryId).toBe('c-transport')
    expect(match?.reason).toBe('category-name')
    expect(match?.confidence).toBeGreaterThanOrEqual(85)
  })

  it('matches a learned hint, with confidence growing as it is confirmed again', () => {
    const once = resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'c-food', 1)])
    const often = resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'c-food', 8)])
    expect(once?.categoryId).toBe('c-food')
    expect(often!.confidence).toBeGreaterThan(once!.confidence)
    expect(often!.confidence).toBeLessThanOrEqual(95)
  })

  it('ignores a hint pointing at a category that no longer exists', () => {
    expect(resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'deleted', 9)])).toBeNull()
  })

  it('returns null when nothing matches, rather than guessing', () => {
    expect(resolveLocally('xyzzy 20rb', CATEGORIES, [])).toBeNull()
  })

  it('never resolves a spend message to an income category', () => {
    const match = resolveLocally('beli kaos gaji 20rb', CATEGORIES, [hint('gaji', 'c-salary', 9)], 'expense')
    expect(match?.categoryId).not.toBe('c-salary')
  })

  it('resolves an income message only within income categories', () => {
    const match = resolveLocally('gaji masuk 5jt', CATEGORIES, [hint('gaji', 'c-salary', 9)], 'income')
    expect(match?.categoryId).toBe('c-salary')
  })
})

describe('detectType', () => {
  it('reads income wording', () => {
    for (const t of ['gaji masuk 5jt', 'terima bonus 1jt', 'refund 50rb', 'cashback 10rb', 'thr 2jt']) {
      expect(detectType(t)).toBe('income')
    }
  })

  it('reads transfer wording', () => {
    for (const t of ['pindah ke bca 1jt', 'transfer ke gopay 100rb', 'tf 50rb', 'tarik tunai 200rb', 'top up ovo 50rb']) {
      expect(detectType(t)).toBe('transfer')
    }
  })

  it('returns null for ordinary spending so the caller keeps its own default', () => {
    expect(detectType('makan siang 35rb')).toBeNull()
  })
})

describe('detectDateOffset', () => {
  it('reads the relative day words', () => {
    expect(detectDateOffset('kopi kemarin 20rb')).toBe(-1)
    expect(detectDateOffset('kopi kemarin lusa 20rb')).toBe(-2)
    expect(detectDateOffset('kopi 20rb')).toBe(0)
  })
})

describe('splitSegments', () => {
  it('splits on the separators people actually use', () => {
    expect(splitSegments('makan 35rb, bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb dan bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb\nbensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb; bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb,bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
  })

  it('NEVER splits inside a number — that would silently rewrite an amount', () => {
    expect(splitSegments('beli hp 1,5jt')).toEqual(['beli hp 1,5jt'])
    expect(splitSegments('bayar kos 1.500.000')).toEqual(['bayar kos 1.500.000'])
    expect(splitSegments('transfer 1,250,000')).toEqual(['transfer 1,250,000'])
  })

  it('splits a plain-number comma list — the comma abuts a digit on one side only (C1)', () => {
    expect(splitSegments('kopi 20000, teh 5000')).toEqual(['kopi 20000', 'teh 5000'])
    expect(splitSegments('jajan 100.000, bensin 50.000')).toEqual(['jajan 100.000', 'bensin 50.000'])
    expect(splitSegments('a 1rb; b 2rb')).toEqual(['a 1rb', 'b 2rb'])
    expect(splitSegments('a 1rb dan b 2rb')).toEqual(['a 1rb', 'b 2rb'])
    expect(splitSegments('a 1rb\nb 2rb')).toEqual(['a 1rb', 'b 2rb'])
  })

  it('keeps a dotted thousands amount ("1.500.000") whole even next to a real separator', () => {
    expect(splitSegments('kos 1.500.000, listrik 200.000')).toEqual(['kos 1.500.000', 'listrik 200.000'])
  })

  it('returns the whole message when there is nothing to split', () => {
    expect(splitSegments('makan siang 35rb')).toEqual(['makan siang 35rb'])
  })
})

describe('tryLocalBatch', () => {
  const hints = [hint('kopi', 'c-food', 9), hint('bensin', 'c-transport', 9)]

  it('builds a whole multi-transaction batch with no model call at all', () => {
    const lines = tryLocalBatch('kopi 20rb, bensin 50rb', CATEGORIES, hints, NOW)
    expect(lines).toHaveLength(2)
    expect(lines![0].categoryId).toBe('c-food')
    expect(lines![1].categoryId).toBe('c-transport')
    expect(lines!.map((l) => l.n)).toEqual([1, 2])
  })

  it('gives up entirely when any segment cannot be resolved locally', () => {
    // A half-local batch would mix confirmed knowledge with silent defaults, and the
    // user could not tell which line was which. Let the model see the whole message.
    expect(tryLocalBatch('kopi 20rb, xyzzy 50rb', CATEGORIES, hints, NOW)).toBeNull()
  })

  it('gives up when a segment has no parseable amount', () => {
    expect(tryLocalBatch('kopi 20rb, bensin', CATEGORIES, hints, NOW)).toBeNull()
  })

  it('applies the detected type and date per segment', () => {
    const lines = tryLocalBatch(
      'kopi kemarin 20rb, gaji masuk 5jt',
      CATEGORIES,
      [...hints, hint('gaji', 'c-salary', 9)],
      NOW,
    )
    expect(lines![0].dateIso.slice(0, 10)).toBe('2026-09-05')
    expect(lines![1].type).toBe('income')
    expect(lines![1].categoryId).toBe('c-salary')
  })

  it('keeps a decimal amount intact through the split', () => {
    const lines = tryLocalBatch('kopi 1,5jt', CATEGORIES, hints, NOW)
    expect(lines![0].amount).toBe(1_500_000)
  })

  it('carries the LocalMatch confidence onto each built line', () => {
    const lines = tryLocalBatch('kopi 20rb, bensin 50rb', CATEGORIES, hints, NOW)
    // freq 9 → 60 + 9*5 capped at 95
    expect(lines!.every((l) => l.confidence === 95)).toBe(true)
  })

  it('builds every line from a plain-number comma list instead of dropping all but the first (C1)', () => {
    const lines = tryLocalBatch('kopi 20000, bensin 50000', CATEGORIES, hints, NOW)
    expect(lines).toHaveLength(2)
    expect(lines![0].amount).toBe(20_000)
    expect(lines![1].amount).toBe(50_000)
  })
})
