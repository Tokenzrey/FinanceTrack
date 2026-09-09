/**
 * Turns a chat message into a typed productivity command. Deterministic and
 * I/O-free, like every other parser in this directory: consumed by
 * `flow-productivity.ts` (Task 8) and wired into `dispatchText` (Task 9).
 *
 * Anything that is not a productivity command returns `{ kind: 'none' }` so the
 * bot dispatcher falls through to the finance-transaction parser.
 */
import { parseWhen, stripWhenTokens, type ParsedWhen } from '@/shared/lib/parse-when'
import type { TaskPriority } from '@/shared/types/productivity'

export type ProductivityCommand =
  | { kind: 'task_add'; title: string; when: ParsedWhen | null; priority: TaskPriority | null }
  | { kind: 'task_list'; filter: 'today' | 'open' | 'all' }
  | { kind: 'task_done'; ref: number } // 1-based number from the last list
  | { kind: 'task_rm'; ref: number }
  | {
      kind: 'task_edit'
      ref: number
      patch: { title?: string; when?: ParsedWhen | null; priority?: TaskPriority }
    }
  | { kind: 'note_add'; text: string }
  | { kind: 'note_search'; keyword: string }
  | { kind: 'note_list' }
  | { kind: 'note_view'; ref: number }
  | { kind: 'reminder_add'; message: string; when: ParsedWhen }
  | { kind: 'agenda' }
  | { kind: 'snooze'; ref: number | null; reminderId: string | null; minutes: number }
  | { kind: 'mark_done_token'; reminderId: string }
  | { kind: 'none' }

export const PRODUCTIVITY_TOKEN_PREFIX = 'pr:'

const NONE: ProductivityCommand = Object.freeze({ kind: 'none' as const })

type Verb = 'task' | 'done' | 'rm' | 'agenda' | 'note' | 'reminder' | 'snooze'

const VERB_ALIASES: Record<string, Verb> = {
  task: 'task',
  tugas: 'task',
  done: 'done',
  selesai: 'done',
  hapus: 'rm',
  agenda: 'agenda',
  note: 'note',
  catat: 'note',
  catatan: 'note',
  ingatkan: 'reminder',
  reminder: 'reminder',
  tunda: 'snooze',
  snooze: 'snooze',
}

const RE_INT = /^\d+$/
const RE_TASK_SUBVERB = /^(?:done|selesai|rm|hapus)\s+(\d+)\b/i
const RE_TASK_EDIT = /^(?:edit|ubah)\s+(\d+)\s+(.+)$/i

function priorityOf(text: string): TaskPriority | null {
  const t = text.toLowerCase()
  if (/!(?:high|hi|p1)\b/.test(t)) return 'high'
  if (/!(?:low|lo|p3)\b/.test(t)) return 'low'
  if (/!(?:med|p2)\b/.test(t)) return 'med'
  return null
}

function titleOf(rest: string): string {
  return stripWhenTokens(rest)
    .replace(/!\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function taskAdd(rest: string, now: Date, timeZone: string): ProductivityCommand {
  return {
    kind: 'task_add',
    title: titleOf(rest),
    when: parseWhen(rest, now, timeZone),
    priority: priorityOf(rest),
  }
}

function handleTask(rest: string, now: Date, timeZone: string): ProductivityCommand {
  if (!rest) return { kind: 'task_list', filter: 'open' }

  const lower = rest.toLowerCase()
  if (lower === 'hari ini') return { kind: 'task_list', filter: 'today' }
  if (lower === 'all' || lower === 'semua') return { kind: 'task_list', filter: 'all' }

  const sub = rest.match(RE_TASK_SUBVERB)
  if (sub) {
    const ref = Number(sub[1])
    return /^(?:rm|hapus)/i.test(rest) ? { kind: 'task_rm', ref } : { kind: 'task_done', ref }
  }

  const edit = rest.match(RE_TASK_EDIT)
  if (edit) {
    const ref = Number(edit[1])
    const body = edit[2]
    const title = titleOf(body)
    const when = parseWhen(body, now, timeZone)
    const priority = priorityOf(body)
    const patch: { title?: string; when?: ParsedWhen | null; priority?: TaskPriority } = {}
    if (title) patch.title = title
    if (when) patch.when = when
    if (priority) patch.priority = priority
    return { kind: 'task_edit', ref, patch }
  }

  return taskAdd(rest, now, timeZone)
}

function handleNote(rest: string): ProductivityCommand {
  if (!rest) return { kind: 'note_list' }
  const search = rest.match(/^cari\s+(.+)$/i)
  if (search) return { kind: 'note_search', keyword: search[1].trim() }
  // `lihat 3` / `buka 3` — read one note from the last `/catat` list in full.
  const view = rest.match(/^(?:lihat|buka)\s+(\d+)$/i)
  if (view) return { kind: 'note_view', ref: Number(view[1]) }
  return { kind: 'note_add', text: rest }
}

function handleReminder(rest: string, now: Date, timeZone: string): ProductivityCommand {
  if (!rest) return NONE
  const when = parseWhen(rest, now, timeZone)
  if (!when) return NONE
  return { kind: 'reminder_add', message: stripWhenTokens(rest).trim(), when }
}

/** `"/tugas beli susu"` → `['task', 'beli susu']`; `verb` is `undefined` when the first
 *  token is not one of ours. */
function splitVerb(text: string): { verb: Verb | undefined; rest: string } {
  const trimmed = text.trim().replace(/^\/+/, '')
  if (!trimmed) return { verb: undefined, rest: '' }
  const firstSpace = trimmed.search(/\s/)
  const verbRaw = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)
  return {
    verb: VERB_ALIASES[verbRaw.toLowerCase()],
    rest: firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim(),
  }
}

/**
 * Cheap, I/O-free pre-check on the first token. `dispatchText` gates the user's
 * timezone read (a Firestore round-trip on the hot path) behind this, so a plain
 * finance message never pays for it.
 */
export function looksLikeProductivityCommand(text: string): boolean {
  return splitVerb(text).verb !== undefined
}

export function parseProductivityCommand(
  text: string,
  now: Date,
  timeZone: string,
): ProductivityCommand {
  const { verb, rest } = splitVerb(text)
  if (!verb) return NONE

  switch (verb) {
    case 'task':
      return handleTask(rest, now, timeZone)
    case 'done':
      return RE_INT.test(rest) ? { kind: 'task_done', ref: Number(rest) } : NONE
    case 'rm':
      // `hapus` is generic; only claim it as productivity when it is a bare integer,
      // otherwise the finance parser needs to see it.
      return RE_INT.test(rest) ? { kind: 'task_rm', ref: Number(rest) } : NONE
    case 'agenda':
      return { kind: 'agenda' }
    case 'note':
      return handleNote(rest)
    case 'reminder':
      return handleReminder(rest, now, timeZone)
    case 'snooze':
      return RE_INT.test(rest)
        ? { kind: 'snooze', ref: null, reminderId: null, minutes: Number(rest) }
        : NONE
  }
}

export function parseProductivityToken(raw: string): ProductivityCommand {
  const parts = raw.trim().split(':')
  if (parts[0] !== 'pr') return NONE

  if (parts.length === 3 && parts[1] === 'done' && parts[2]) {
    return { kind: 'mark_done_token', reminderId: parts[2] }
  }
  if (parts.length === 4 && parts[1] === 'snooze' && parts[2] && RE_INT.test(parts[3])) {
    return { kind: 'snooze', ref: null, reminderId: parts[2], minutes: Number(parts[3]) }
  }
  return NONE
}
