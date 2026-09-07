## Task 3: Parser Perintah Tinjauan

Bahasa edit yang dipakai **kedua** platform (R6/R10). Murni: teks masuk → perintah keluar. Token tombol Telegram (`rv:*`) sengaja diparse fungsi yang sama, supaya menekan tombol dan mengetik perintah bermuara ke satu jalur logika.

**Files:**
- Modify: `src/shared/bot/types.ts` (tambah `ReviewCommand` — versi lengkap di bawah)
- Create: `src/shared/bot/review-commands.ts`
- Test: `src/shared/bot/review-commands.test.ts`

**Interfaces:**
- Consumes: `parseAmount` dari `./parse-amount`
- Produces:
  - `parseReviewCommand(raw: string, now: Date): ReviewCommand`
  - `REVIEW_TOKEN_PREFIX: 'rv:'`
  - `reviewToken(cmd: ReviewCommand): string | null` — kebalikannya, dipakai `replies.ts` untuk membangun `callback_data`

`ReviewCommand` final (menggantikan versi di §4 — tambahan `focus` untuk tombol ✏️ per baris):

```ts
export type ReviewCommand =
  | { kind: 'save' }
  | { kind: 'cancel' }
  | { kind: 'remove'; n: number }
  | { kind: 'set_category'; n: number; option: number }
  | { kind: 'set_amount'; n: number; amount: number }
  | { kind: 'set_description'; n: number; text: string }
  | { kind: 'set_date'; n: number; date: Date }
  | { kind: 'set_type'; n: number; type: BotTxType }
  | { kind: 'set_mode'; mode: 'single' | 'itemized' }
  /** Tombol "✏️ n" di Telegram: tampilkan menu edit untuk satu baris saja. */
  | { kind: 'focus'; n: number }
  | { kind: 'help' }
  | { kind: 'none' }
```

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/review-commands.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/review-commands.test.ts`
Expected: FAIL — `Failed to resolve import "./review-commands"`.

- [ ] **Step 3: Implementasi `review-commands.ts`**

Buat `src/shared/bot/review-commands.ts`:

```ts
import { parseAmount } from './parse-amount'
import type { BotTxType, ReviewCommand } from './types'

/**
 * The edit language of the review card. Deliberately plain and deterministic — no
 * Gemini call, because a misread edit command silently corrupts a number the user was
 * in the middle of correcting.
 *
 * Telegram buttons carry `rv:*` tokens that parse here too, so a tap and a typed
 * command land on exactly the same code path. That is the only way a WhatsApp user
 * (GOWA exposes no buttons at all) gets feature parity.
 */

export const REVIEW_TOKEN_PREFIX = 'rv:' as const

const NONE: ReviewCommand = { kind: 'none' }

/** Line numbers are 1..99: the batch caps at 20, and a bounded range keeps a typo
 *  like "hapus 100000" from becoming a huge array index. */
function lineNumber(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= 99 ? n : null
}

function txType(raw: string): BotTxType | null {
  const word = raw.trim().toLowerCase()
  if (/^(expense|keluar|pengeluaran|beli)$/.test(word)) return 'expense'
  if (/^(income|masuk|pemasukan|terima)$/.test(word)) return 'income'
  if (/^(transfer|pindah|tf)$/.test(word)) return 'transfer'
  return null
}

/** Keeps the clock from `now` so an edited line still carries a real time of day. */
function withClockOf(now: Date, year: number, month: number, day: number): Date | null {
  const next = new Date(now.getTime())
  next.setUTCFullYear(year, month - 1, day)
  if (Number.isNaN(next.getTime())) return null
  // Reject a rolled-over date ("31/2" becoming 3 March) rather than accepting a value
  // the user plainly did not mean.
  if (next.getUTCDate() !== day || next.getUTCMonth() !== month - 1) return null
  return next
}

function shiftDays(now: Date, days: number): Date {
  const next = new Date(now.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function parseDateWord(raw: string, now: Date): Date | null {
  const word = raw.trim().toLowerCase()

  if (/^hari ?ini$/.test(word)) return new Date(now.getTime())
  if (/^kemarin lusa$/.test(word)) return shiftDays(now, -2)
  if (/^kemarin$/.test(word)) return shiftDays(now, -1)

  const iso = word.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return withClockOf(now, Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = word.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/)
  if (dmy) {
    const year = dmy[3] ? Number(dmy[3]) : now.getUTCFullYear()
    return withClockOf(now, year, Number(dmy[2]), Number(dmy[1]))
  }

  return null
}

function parseToken(token: string, now: Date): ReviewCommand {
  const parts = token.slice(REVIEW_TOKEN_PREFIX.length).split(':')
  const [action, a, b] = parts

  if (action === 'save' && parts.length === 1) return { kind: 'save' }
  if (action === 'cancel' && parts.length === 1) return { kind: 'cancel' }

  if (action === 'del') {
    const n = lineNumber(a ?? '')
    return n ? { kind: 'remove', n } : NONE
  }
  if (action === 'edit') {
    const n = lineNumber(a ?? '')
    return n ? { kind: 'focus', n } : NONE
  }
  if (action === 'cat') {
    const n = lineNumber(a ?? '')
    const option = lineNumber(b ?? '')
    return n && option ? { kind: 'set_category', n, option } : NONE
  }
  if (action === 'type') {
    const n = lineNumber(a ?? '')
    const type = txType(b ?? '')
    return n && type ? { kind: 'set_type', n, type } : NONE
  }
  if (action === 'mode') {
    if (a === 'single' || a === 'itemized') return { kind: 'set_mode', mode: a }
    return NONE
  }
  // `now` is unused for tokens today, but the signature stays uniform so a future
  // date-carrying token needs no call-site change.
  void now
  return NONE
}

export function parseReviewCommand(raw: string, now: Date): ReviewCommand {
  const text = raw.trim()
  if (!text) return NONE

  if (text.startsWith(REVIEW_TOKEN_PREFIX)) return parseToken(text, now)

  const lower = text.toLowerCase()

  if (/^(ok|oke|okay|ya|iya|simpan|save)$/.test(lower)) return { kind: 'save' }
  if (/^(batal|cancel|buang|gak jadi)$/.test(lower)) return { kind: 'cancel' }
  if (/^(gabung|gabungkan|jadi ?satu|satukan)$/.test(lower)) return { kind: 'set_mode', mode: 'single' }
  if (/^(pisah|pisahkan|per ?item|rinci|rincikan)$/.test(lower)) return { kind: 'set_mode', mode: 'itemized' }
  if (/^\/?(bantuedit|bantuan ?edit)$/.test(lower)) return { kind: 'help' }

  const remove = lower.match(/^(?:hapus|buang|del) (\d{1,3})$/)
  if (remove) {
    const n = lineNumber(remove[1])
    return n ? { kind: 'remove', n } : NONE
  }

  const category = lower.match(/^(?:kat|kategori) (\d{1,3}) (\d{1,3})$/)
  if (category) {
    const n = lineNumber(category[1])
    const option = lineNumber(category[2])
    return n && option ? { kind: 'set_category', n, option } : NONE
  }

  const amount = text.match(/^(?:nom|nominal|jumlah) (\d{1,3}) (.+)$/i)
  if (amount) {
    const n = lineNumber(amount[1])
    const value = parseAmount(amount[2])
    return n && value !== null && value > 0 ? { kind: 'set_amount', n, amount: value } : NONE
  }

  // Description keeps the original casing — it is user prose, not a keyword.
  const description = text.match(/^(?:ket|keterangan|nama) (\d{1,3}) (.+)$/i)
  if (description) {
    const n = lineNumber(description[1])
    const value = description[2].trim()
    return n && value ? { kind: 'set_description', n, text: value } : NONE
  }

  const date = text.match(/^(?:tgl|tanggal) (\d{1,3}) (.+)$/i)
  if (date) {
    const n = lineNumber(date[1])
    const parsed = parseDateWord(date[2], now)
    return n && parsed ? { kind: 'set_date', n, date: parsed } : NONE
  }

  const type = text.match(/^(?:tipe|jenis) (\d{1,3}) (.+)$/i)
  if (type) {
    const n = lineNumber(type[1])
    const parsed = txType(type[2])
    return n && parsed ? { kind: 'set_type', n, type: parsed } : NONE
  }

  return NONE
}

/** The `callback_data` for a command, or null when it has no button form (anything
 *  that needs free text). Telegram caps `callback_data` at 64 bytes; every token this
 *  produces is well under 20. */
export function reviewToken(cmd: ReviewCommand): string | null {
  switch (cmd.kind) {
    case 'save':
      return 'rv:save'
    case 'cancel':
      return 'rv:cancel'
    case 'remove':
      return `rv:del:${cmd.n}`
    case 'focus':
      return `rv:edit:${cmd.n}`
    case 'set_category':
      return `rv:cat:${cmd.n}:${cmd.option}`
    case 'set_type':
      return `rv:type:${cmd.n}:${cmd.type}`
    case 'set_mode':
      return `rv:mode:${cmd.mode}`
    default:
      return null
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/review-commands.test.ts`
Expected: PASS (17 test).

- [ ] **Step 5: Typecheck & commit**

```bash
npx tsc --noEmit
git add src/shared/bot/types.ts src/shared/bot/review-commands.ts src/shared/bot/review-commands.test.ts
git commit -m "feat(bot): deterministic edit language for the review card

Typed commands (ok, hapus 2, kat 1 3, nom 1 1,5jt, tgl 1 kemarin) and Telegram
callback tokens (rv:*) parse through one function, so a tap and a typed command
take the same code path. That parity is required, not cosmetic: GOWA exposes no
interactive message type, so WhatsApp users only ever type.

Amount edits go through parseAmount — a misread correction is exactly as costly
as a misread original."
```

---

