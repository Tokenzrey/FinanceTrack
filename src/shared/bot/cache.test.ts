import { describe, expect, it } from 'vitest'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import { hashImage, hashParse, stripForCache } from './cache'

describe('hashImage', () => {
  it('is stable for identical bytes and different for different bytes', () => {
    expect(hashImage('AAAA')).toBe(hashImage('AAAA'))
    expect(hashImage('AAAA')).not.toBe(hashImage('AAAB'))
  })

  it('produces a Firestore-safe document id', () => {
    expect(hashImage('AAAA')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('hashParse', () => {
  it('ignores case and surrounding whitespace, which do not change meaning', () => {
    expect(hashParse('  Kopi 20rb ', ['c1'])).toBe(hashParse('kopi 20rb', ['c1']))
  })

  it('changes when the category set changes, so a renamed or new category invalidates it', () => {
    expect(hashParse('kopi 20rb', ['c1'])).not.toBe(hashParse('kopi 20rb', ['c1', 'c2']))
  })

  it('does not depend on the order the category ids arrive in', () => {
    expect(hashParse('kopi 20rb', ['c1', 'c2'])).toBe(hashParse('kopi 20rb', ['c2', 'c1']))
  })
})

describe('stripForCache', () => {
  it('drops rawText, which is the only field big enough to threaten the 1 MiB doc limit', () => {
    const result = {
      extraction: { rawText: 'x'.repeat(100_000), items: [], total: 1000, confidence: 90 },
      mappedItems: [],
      totalConfidence: 90,
      warnings: [],
    } as unknown as ReceiptScanResult

    const stripped = stripForCache(result)
    expect(stripped.extraction.rawText).toBe('')
    expect(stripped.extraction.total).toBe(1000)
  })
})
