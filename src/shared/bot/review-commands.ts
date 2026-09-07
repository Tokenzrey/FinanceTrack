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
    // Reject an absurd figure (>1e12) rather than let it into the ledger / CSV export.
    return n && value !== null && value > 0 && value <= 1_000_000_000_000
      ? { kind: 'set_amount', n, amount: value }
      : NONE
  }

  // Description keeps the original casing — it is user prose, not a keyword. Capped at
  // 500 chars (not rejected) so a multi-KB paste can't land in the ledger / HTML / CSV.
  const description = text.match(/^(?:ket|keterangan|nama) (\d{1,3}) (.+)$/i)
  if (description) {
    const n = lineNumber(description[1])
    const value = description[2].trim().slice(0, 500)
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
