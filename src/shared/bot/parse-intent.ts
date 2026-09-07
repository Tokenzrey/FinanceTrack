import type { BotIntent } from './types'

/**
 * Deterministic keyword matching for the fixed read-commands ("ringkasan", "/saldo",
 * "/undo", …). No model call, no network — just a table of anchored patterns.
 *
 * The Gemini-backed intent parser that used to live here is gone: multi-transaction
 * text now routes through `parse-batch.ts` → `gemini-router.ts` (metered by the quota
 * ledger), and `core.ts` only ever imports `matchReadCommand` from this file.
 */

const READ_COMMANDS: { pattern: RegExp; intent: BotIntent }[] = [
  // `/?` accepts both the bare keyword ("ringkasan") and the Telegram slash-command
  // form ("/ringkasan") — command menu entries and old muscle-memory keywords both work.
  { pattern: /^\/?(ringkasan|summary)$/i, intent: 'get_summary' },
  { pattern: /^\/?(sisa|saldo)$/i, intent: 'get_balance' },
  { pattern: /^\/?(kategori|categories)$/i, intent: 'list_categories' },
  { pattern: /^\/?(riwayat|history)$/i, intent: 'get_recent' },
  { pattern: /^\/?(tahunan|year)$/i, intent: 'get_year_summary' },
  { pattern: /^\/?(target|goals?)$/i, intent: 'list_goals' },
  { pattern: /^\/?setor$/i, intent: 'contribute_goal' },
  { pattern: /^\/?(kekayaan|networth)$/i, intent: 'net_worth' },
  { pattern: /^\/?rutin$/i, intent: 'list_recurring' },
  { pattern: /^\/?wishlist$/i, intent: 'list_wishlist' },
  { pattern: /^\/?(hariini|hari ini|today)$/i, intent: 'today_summary' },
  { pattern: /^\/?(minggu|mingguan|pekan|week)$/i, intent: 'week_summary' },
  { pattern: /^\/?(statistik|stats)$/i, intent: 'stats' },
  { pattern: /^\/?(undo|urungkan)$/i, intent: 'undo' },
  // Bare `/cari` only — with an argument it is handled before matchReadCommand runs.
  { pattern: /^\/?(cari|search)$/i, intent: 'search' },
  { pattern: /^\/?(batal|cancel)$/i, intent: 'cancel_pending' },
  { pattern: /^\/?(bantuan|help|start)$/i, intent: 'help' },
  { pattern: /^\/?putuskan$/i, intent: 'unlink' },
]

/**
 * Matches the fixed read-commands by plain keyword, before ever calling Gemini —
 * cheaper, faster, and immune to the model ever misreading a one-word command.
 */
export function matchReadCommand(text: string): BotIntent | null {
  const trimmed = text.trim()
  for (const { pattern, intent } of READ_COMMANDS) {
    if (pattern.test(trimmed)) return intent
  }
  return null
}
