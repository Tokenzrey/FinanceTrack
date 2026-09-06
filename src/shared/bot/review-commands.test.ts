import { describe, expect, it } from 'vitest'
import { parseReviewCommand, reviewToken } from './review-commands'

const NOW = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))
const cmd = (text: string) => parseReviewCommand(text, NOW)

describe('parseReviewCommand — commit & cancel', () => {
  it('accepts every natural way an Indonesian user says "save"', () => {
    for (const word of ['ok', 'OK', 'oke', 'ya', 'simpan', 'save', ' ok ']) {
      expect(cmd(word)).toEqual({ kind: 'save' })
    }
  })

  it('accepts every natural way of saying "cancel"', () => {
    for (const word of ['batal', 'Batal', 'cancel', 'buang']) {
      expect(cmd(word)).toEqual({ kind: 'cancel' })
    }
  })
})

describe('parseReviewCommand — line edits', () => {
  it('parses "hapus 2"', () => {
    expect(cmd('hapus 2')).toEqual({ kind: 'remove', n: 2 })
  })

  it('parses "kat 1 3" as line 1 taking option 3', () => {
    expect(cmd('kat 1 3')).toEqual({ kind: 'set_category', n: 1, option: 3 })
  })

  it('parses an amount edit through parseAmount, not parseInt', () => {
    expect(cmd('nom 1 1,5jt')).toEqual({ kind: 'set_amount', n: 1, amount: 1_500_000 })
    expect(cmd('nom 2 250.000')).toEqual({ kind: 'set_amount', n: 2, amount: 250_000 })
  })

  it('rejects an amount edit whose value cannot be parsed', () => {
    expect(cmd('nom 1 banyak')).toEqual({ kind: 'none' })
  })

  it('rejects an absurd amount edit above 1e12 (N7)', () => {
    expect(cmd('nom 1 999999999999999')).toEqual({ kind: 'none' })
  })

  it('caps a long description edit at 500 chars rather than rejecting it (N7)', () => {
    const parsed = cmd(`ket 1 ${'x'.repeat(600)}`) as { kind: string; text: string }
    expect(parsed.kind).toBe('set_description')
    expect(parsed.text.length).toBe(500)
  })

  it('takes the whole remainder as the description, spaces and all', () => {
    expect(cmd('ket 2 kopi susu gula aren')).toEqual({
      kind: 'set_description',
      n: 2,
      text: 'kopi susu gula aren',
    })
  })

  it('parses transaction type edits', () => {
    expect(cmd('tipe 1 transfer')).toEqual({ kind: 'set_type', n: 1, type: 'transfer' })
    expect(cmd('tipe 1 masuk')).toEqual({ kind: 'set_type', n: 1, type: 'income' })
    expect(cmd('tipe 1 keluar')).toEqual({ kind: 'set_type', n: 1, type: 'expense' })
  })
})

describe('parseReviewCommand — dates', () => {
  it('understands "hari ini" and "kemarin"', () => {
    expect((cmd('tgl 1 hari ini') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2026-09-06')
    expect((cmd('tgl 1 kemarin') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect((cmd('tgl 1 kemarin lusa') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2026-09-04')
  })

  it('understands d/m, d/m/yyyy and yyyy-mm-dd', () => {
    expect((cmd('tgl 1 3/9') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2026-09-03')
    expect((cmd('tgl 1 3/9/2025') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2025-09-03')
    expect((cmd('tgl 1 2026-08-31') as { date: Date }).date.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('keeps the clock from `now` so the reply still reads as a moment', () => {
    const parsed = cmd('tgl 1 kemarin') as { date: Date }
    expect(parsed.date.getUTCHours()).toBe(7)
    expect(parsed.date.getUTCMinutes()).toBe(32)
  })

  it('rejects an unparseable date rather than silently using today', () => {
    expect(cmd('tgl 1 besok lusa minggu depan')).toEqual({ kind: 'none' })
  })
})

describe('parseReviewCommand — mode & help', () => {
  it('parses the merge/split words', () => {
    expect(cmd('gabung')).toEqual({ kind: 'set_mode', mode: 'single' })
    expect(cmd('pisah')).toEqual({ kind: 'set_mode', mode: 'itemized' })
    expect(cmd('rinci')).toEqual({ kind: 'set_mode', mode: 'itemized' })
  })

  it('parses the edit-help request', () => {
    expect(cmd('bantuedit')).toEqual({ kind: 'help' })
    expect(cmd('/bantuedit')).toEqual({ kind: 'help' })
  })
})

describe('parseReviewCommand — Telegram callback tokens', () => {
  it('parses every token replies.ts can emit', () => {
    expect(cmd('rv:save')).toEqual({ kind: 'save' })
    expect(cmd('rv:cancel')).toEqual({ kind: 'cancel' })
    expect(cmd('rv:del:2')).toEqual({ kind: 'remove', n: 2 })
    expect(cmd('rv:cat:1:3')).toEqual({ kind: 'set_category', n: 1, option: 3 })
    expect(cmd('rv:mode:single')).toEqual({ kind: 'set_mode', mode: 'single' })
    expect(cmd('rv:type:1:transfer')).toEqual({ kind: 'set_type', n: 1, type: 'transfer' })
    expect(cmd('rv:edit:2')).toEqual({ kind: 'focus', n: 2 })
  })

  it('returns none for a malformed token instead of throwing', () => {
    expect(cmd('rv:cat:abc')).toEqual({ kind: 'none' })
    expect(cmd('rv:nonsense')).toEqual({ kind: 'none' })
  })
})

describe('parseReviewCommand — non-commands', () => {
  it('returns none for ordinary text so the caller can treat it as something else', () => {
    expect(cmd('makan siang 35rb')).toEqual({ kind: 'none' })
    expect(cmd('/ringkasan')).toEqual({ kind: 'none' })
    expect(cmd('')).toEqual({ kind: 'none' })
  })

  it('rejects a line number outside 1..99 rather than producing a huge index', () => {
    expect(cmd('hapus 0')).toEqual({ kind: 'none' })
    expect(cmd('hapus 100')).toEqual({ kind: 'none' })
  })
})

describe('reviewToken', () => {
  it('round-trips every command that has a button form', () => {
    const cases = [
      { kind: 'save' } as const,
      { kind: 'cancel' } as const,
      { kind: 'remove', n: 2 } as const,
      { kind: 'set_category', n: 1, option: 3 } as const,
      { kind: 'set_mode', mode: 'itemized' } as const,
      { kind: 'focus', n: 4 } as const,
    ]
    for (const c of cases) {
      const token = reviewToken(c)
      expect(token).not.toBeNull()
      expect((token as string).length).toBeLessThanOrEqual(64)
      expect(parseReviewCommand(token as string, NOW)).toEqual(c)
    }
  })

  it('returns null for commands that only exist as typed text', () => {
    expect(reviewToken({ kind: 'set_description', n: 1, text: 'x' })).toBeNull()
    expect(reviewToken({ kind: 'none' })).toBeNull()
  })
})
