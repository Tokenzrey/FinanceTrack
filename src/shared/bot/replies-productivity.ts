import { formatDateTime } from '@/shared/lib/format'
import type { Note, Reminder, ReminderFreq, Task } from '@/shared/types/productivity'
import type { BotReply } from './types'

/** Bahasa Indonesia reply copy for the productivity bot (tugas / catatan / pengingat).
 *  Pure formatting: domain objects in, `BotReply` out — same house style as `replies.ts`
 *  (`html: true`, `<b>`/`<i>`/`<code>`, emoji). `reminderPush` is the one exception: the
 *  cron path (Task 10) wants a plain `{ text, buttons }` pair, not a `BotReply`. */

/** Escape the 3 chars HTML needs — wrap every user/model-produced value (titles, note
 *  bodies, reminder messages, search keywords, names) exactly like `replies.ts` does. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function reply(text: string): BotReply {
  return { text, html: true }
}

const STATUS_ICON: Record<Task['status'], string> = { todo: '⬜', doing: '🔧', done: '✅' }
const PRIORITY_ICON: Record<Task['priority'], string> = { high: '🔴', med: '🟡', low: '⚪' }
const FREQ_LABEL: Record<ReminderFreq, string> = {
  daily: 'tiap hari',
  weekly: 'tiap minggu',
  weekday: 'tiap hari kerja',
}

const LIST_TITLE: Record<'today' | 'open' | 'all', string> = {
  today: 'Tugas Hari Ini',
  open: 'Tugas Aktif',
  all: 'Semua Tugas',
}

function taskLine(t: Task, n: number, tz: string): string {
  const head = `${n}. ${STATUS_ICON[t.status]} ${PRIORITY_ICON[t.priority]} ${escapeHtml(t.title)}`
  return t.dueAt ? `${head}\n    🗓 ${formatDateTime(t.dueAt.toDate(), tz)}` : head
}

function numberedTasks(items: Task[], tz: string): string {
  return items.map((t, i) => taskLine(t, i + 1, tz)).join('\n')
}

function reminderLine(r: Reminder, n: number, tz: string): string {
  return `${n}. ⏰ ${formatDateTime(r.remindAt.toDate(), tz)} — ${escapeHtml(r.message)}`
}

function numberedReminders(items: Reminder[], tz: string): string {
  return items.map((r, i) => reminderLine(r, i + 1, tz)).join('\n')
}

/** "\n🔁 Berulang tiap hari [sampai …]" — empty string when the reminder is one-off. */
function recurrenceHint(r: Reminder, tz: string): string {
  if (!r.recurrence) return ''
  const until = r.recurrence.until ? ` sampai ${formatDateTime(r.recurrence.until.toDate(), tz)}` : ''
  return `\n🔁 Berulang ${FREQ_LABEL[r.recurrence.freq]}${until}`
}

/** Collapse a note body to a single trimmed line for list/preview contexts. */
function snippet(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

// ─── Tugas ─────────────────────────────────────────────────────

export function taskCreated(t: Task, tz: string, reminderAt: Date | null): BotReply {
  const lines = ['✅ <b>Tugas dicatat</b>', '', taskLine(t, 1, tz)]
  if (reminderAt) lines.push(`⏰ Diingatkan ${formatDateTime(reminderAt, tz)}`)
  return reply(lines.join('\n'))
}

export function taskList(items: Task[], filter: 'today' | 'open' | 'all', tz: string): BotReply {
  const title = `📋 <b>${LIST_TITLE[filter]}</b>`
  if (items.length === 0) {
    return reply(`${title}\n\nTidak ada tugas di sini — santai dulu ☕`)
  }
  return reply(`${title}\n\n${numberedTasks(items, tz)}`)
}

export function taskDone(t: Task): BotReply {
  return reply(`✅ <b>Selesai:</b> <i>${escapeHtml(t.title)}</i>\nMantap, satu lagi kelar 🎉`)
}

export function taskRemoved(title: string): BotReply {
  return reply(`🗑 Tugas <i>${escapeHtml(title)}</i> dihapus.`)
}

export function taskRefNotFound(ref: number): BotReply {
  return reply(
    `🤔 Tidak ada tugas nomor <b>${ref}</b>. Ketik <code>/tugas</code> untuk lihat daftarnya.`,
  )
}

// ─── Catatan ───────────────────────────────────────────────────

export function noteSaved(n: Note): BotReply {
  const lines = ['📝 <b>Catatan tersimpan</b>', '', `<b>${escapeHtml(n.title)}</b>`]
  if (n.content.trim()) lines.push(`<i>${escapeHtml(snippet(n.content))}</i>`)
  if (n.tags.length > 0) lines.push(`🏷 ${n.tags.map((tag) => escapeHtml(tag)).join(', ')}`)
  return reply(lines.join('\n'))
}

export function noteSearchResult(keyword: string, items: Note[]): BotReply {
  const kw = escapeHtml(keyword)
  if (items.length === 0) {
    return reply(`🔎 Tidak ada catatan yang cocok dengan "<b>${kw}</b>".`)
  }
  const body = items
    .map((n, i) => `${i + 1}. <b>${escapeHtml(n.title)}</b>\n    <i>${escapeHtml(snippet(n.content, 100))}</i>`)
    .join('\n')
  return reply(`🔎 <b>Hasil untuk "${kw}"</b>\n\n${body}`)
}

export function noteList(items: Note[]): BotReply {
  if (items.length === 0) return reply('📒 Catatan masih kosong. Kirim apa saja untuk menyimpannya.')
  const body = items.map((n, i) => `${i + 1}. <b>${escapeHtml(n.title)}</b>`).join('\n')
  return reply(`📒 <b>Catatan</b>\n\n${body}`)
}

// ─── Pengingat ─────────────────────────────────────────────────

export function reminderSet(r: Reminder, tz: string): BotReply {
  return reply(
    `⏰ <b>Pengingat disetel</b>\n\n${escapeHtml(r.message)}\n🗓 ${formatDateTime(r.remindAt.toDate(), tz)}` +
      recurrenceHint(r, tz),
  )
}

export function reminderNeedsTime(): BotReply {
  return reply(
    '🤔 Kapan mau diingatkan? Contoh: <code>/ingatkan bayar listrik besok jam 9</code>',
  )
}

export function snoozed(r: Reminder, tz: string): BotReply {
  return reply(`😴 Oke, diingatkan lagi <b>${formatDateTime(r.remindAt.toDate(), tz)}</b>.`)
}

/** `/tunda N` with no button context and nothing pushed yet. */
export function noRecentReminder(): BotReply {
  return reply('🤔 Belum ada pengingat terakhir untuk ditunda.')
}

/** A `pr:done:<id>` / `pr:snooze:<id>` tap whose reminder has since been deleted. */
export function reminderGone(): BotReply {
  return reply('👍 Pengingat itu sudah tidak ada.')
}

/** `pr:done:<id>` on a standalone reminder (nothing to mark done beyond the reminder). */
export function reminderMarkedDone(): BotReply {
  return reply('✅ Pengingat ditandai selesai.')
}

/** Reminder body + action buttons for the cron send path (Task 10). Not a `BotReply`:
 *  `buttons` carry raw callback tokens the flow router parses (`pr:done:<id>` etc). */
export function reminderPush(
  r: Reminder,
  tz: string,
): { text: string; buttons: { text: string; token: string }[] } {
  return {
    text: `⏰ <i>Pengingat</i>\n\n${escapeHtml(r.message)}${recurrenceHint(r, tz)}`,
    buttons: [
      { text: '✅ Selesai', token: `pr:done:${r.id}` },
      { text: '😴 +15 mnt', token: `pr:snooze:${r.id}:15` },
      { text: '😴 +1 jam', token: `pr:snooze:${r.id}:60` },
    ],
  }
}

// ─── Agenda & digest ───────────────────────────────────────────

export function agenda(
  tasks: Task[],
  reminders: Reminder[],
  tz: string,
  dayLabel: string,
): BotReply {
  const title = `📅 <b>Agenda ${escapeHtml(dayLabel)}</b>`
  if (tasks.length === 0 && reminders.length === 0) {
    return reply(`${title}\n\nAgenda kamu kosong hari ini — santai dulu ☕`)
  }
  const parts = [title]
  if (tasks.length > 0) parts.push('', '<b>Tugas</b>', numberedTasks(tasks, tz))
  if (reminders.length > 0) parts.push('', '<b>Pengingat</b>', numberedReminders(reminders, tz))
  return reply(parts.join('\n'))
}

export function digest(
  userName: string | null,
  tasks: Task[],
  reminders: Reminder[],
  tz: string,
): BotReply {
  const greeting = userName ? `☀️ <b>Selamat pagi, ${escapeHtml(userName)}!</b>` : '☀️ <b>Selamat pagi!</b>'
  if (tasks.length === 0 && reminders.length === 0) {
    return reply(`${greeting}\n\nNikmati harimu — tidak ada yang mendesak hari ini 😎`)
  }
  const parts = [
    greeting,
    '',
    `Hari ini ada <b>${tasks.length} tugas</b> dan <b>${reminders.length} pengingat</b>.`,
  ]
  if (tasks.length > 0) parts.push('', '<b>Tugas</b>', numberedTasks(tasks, tz))
  if (reminders.length > 0) parts.push('', '<b>Pengingat</b>', numberedReminders(reminders, tz))
  return reply(parts.join('\n'))
}

// ─── Fallback ──────────────────────────────────────────────────

export function planFallbackError(): BotReply {
  return reply(
    '⚠️ Lagi tidak bisa memproses permintaan itu. Coba lagi sebentar lagi, atau tulis perintahnya lebih sederhana.',
  )
}
