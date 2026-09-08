import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { DocumentReference, Query } from 'firebase-admin/firestore'
import { getAdminDb } from '@/shared/lib/firebase-admin'
import { getUserTimezone, stripUndefined } from '@/shared/bot/admin-data'
import { dayKeyInTz, formatDateTime } from '@/shared/lib/format'
import { DEFAULT_PLANNER_PREFS, normalizeTags } from '@/shared/types/productivity'
import type {
  CreateNoteDTO,
  CreateReminderDTO,
  CreateTaskDTO,
  Note,
  PlannerPrefs,
  Reminder,
  Task,
  UpdateTaskDTO,
} from '@/shared/types/productivity'
import type { BoardList, Label } from '@/shared/types/board'
import { listForStatus, statusForList } from '@/shared/lib/task-status-sync'

/**
 * Firestore Admin SDK data layer for the productivity modules (tasks, notes,
 * reminders). Server-only — the same rule as `admin-data.ts`: never import from a
 * Client Component. The bot flow (Task 8) and the cron endpoints (`/api/cron/reminders`,
 * `/api/cron/daily-digest`) are the consumers.
 *
 * Every `.set()` / `.update()` payload goes through `stripUndefined` (borrowed from
 * `admin-data.ts`) because the Admin SDK rejects `undefined` field values.
 */

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Timezone helpers ─────────────────────────────────────────
// Same Intl-based offset trick as `core.ts` / `parse-when.ts` — copied rather than
// imported so this module does not pull in those heavier files.

/** Milliseconds `timeZone` is ahead of UTC at instant `at`. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour === 24 ? 0 : +p.hour,
    +p.minute,
    +p.second,
  )
  return asUTC - at.getTime()
}

/** The instant of local midnight (start of `date`'s local day) in `timeZone`. */
function localDayStart(date: Date, timeZone: string): Date {
  const [y, m, d] = dayKeyInTz(date, timeZone).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - tzOffsetMs(date, timeZone))
}

// ─── Board lists (Admin SDK reader) ───────────────────────────

/** The board's columns for a user, ordered by `order` asc. Empty (no board yet) → `[]`.
 *  Mirrors `toBoardList` in FirestoreBoardListRepository — same `?? default` fallbacks. */
export async function getBoardLists(userId: string): Promise<BoardList[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/lists`)
    .orderBy('order', 'asc')
    .get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      title: data.title ?? '',
      order: data.order ?? 0,
      mapsToStatus: data.mapsToStatus ?? 'todo',
      wipLimit: data.wipLimit ?? null,
      isCollapsed: data.isCollapsed ?? false,
      createdAt: data.createdAt ?? Timestamp.now(),
      updatedAt: data.updatedAt ?? Timestamp.now(),
    } as BoardList
  })
}

/** The board's labels for a user, ordered by `order` asc. Empty (no board yet) → `[]`.
 *  Mirrors `getBoardLists` — same Admin SDK shape, same `?? default` fallbacks. */
export async function getBoardLabels(userId: string): Promise<Label[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/labels`)
    .orderBy('order', 'asc')
    .get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name ?? '',
      colorKey: data.colorKey ?? 'slate',
      order: data.order ?? 0,
      createdAt: data.createdAt ?? Timestamp.now(),
    } as Label
  })
}

// ─── Tasks ────────────────────────────────────────────────────

export async function createTask(userId: string, dto: CreateTaskDTO): Promise<Task> {
  const ref = getAdminDb().collection(`users/${userId}/tasks`).doc()
  const now = Timestamp.now()
  const dueAt = dto.dueAt ? Timestamp.fromDate(dto.dueAt) : null
  // The bot always creates as status:'todo' → put the card in the first todo column
  // (or null if the user has no board yet — Task 4's migration backfills it).
  const listId = listForStatus('todo', await getBoardLists(userId))
  const doc = {
    title: dto.title,
    notes: dto.notes ?? null,
    status: 'todo',
    priority: dto.priority ?? 'med',
    dueAt,
    doneAt: null,
    listId,
    order: Date.now(), // ponytail: monotonic append value, board/migration re-ranks properly
    source: dto.source,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  await ref.set(stripUndefined(doc))
  return { id: ref.id, ...doc, createdAt: now, updatedAt: now } as unknown as Task
}

export async function updateTask(
  userId: string,
  taskId: string,
  patch: UpdateTaskDTO,
): Promise<Task> {
  const ref = getAdminDb().doc(`users/${userId}/tasks/${taskId}`)
  const snap = await ref.get()
  const prev = (snap.exists ? snap.data() : {}) as Partial<Task>
  const now = Timestamp.now()

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.priority !== undefined) update.priority = patch.priority
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt ? Timestamp.fromDate(patch.dueAt) : null

  // Directional status ↔ listId sync: whichever field the caller explicitly set wins,
  // the other follows it. (Not `reconcile` — that's list-wins, for the board-drag path
  // only. Here an explicit `/selesai` must force `status:'done'`, not be snapped back
  // by a stale `todo` listId.) Only pay the lists read when one of them moves.
  if (patch.status !== undefined || patch.listId !== undefined) {
    const lists = await getBoardLists(userId)
    if (patch.status !== undefined) {
      update.status = patch.status
      update.listId = listForStatus(patch.status, lists)
    } else if (patch.listId !== undefined) {
      update.listId = patch.listId
      update.status = statusForList(patch.listId, lists)
    }
  }

  if (patch.status === 'done' && prev.status !== 'done')
    update.doneAt = FieldValue.serverTimestamp()

  await ref.update(stripUndefined(update))

  const merged: Record<string, unknown> = { ...prev, id: taskId, ...update, updatedAt: now }
  if (update.doneAt) merged.doneAt = now
  return merged as unknown as Task
}

function compareTasks(a: Task, b: Task): number {
  const ad = a.dueAt ? a.dueAt.toMillis() : Number.POSITIVE_INFINITY
  const bd = b.dueAt ? b.dueAt.toMillis() : Number.POSITIVE_INFINITY
  if (ad !== bd) return ad - bd
  const ac = a.createdAt ? a.createdAt.toMillis() : 0
  const bc = b.createdAt ? b.createdAt.toMillis() : 0
  return ac - bc
}

export async function listTasks(
  userId: string,
  filter: 'today' | 'open' | 'all',
  tz: string,
): Promise<Task[]> {
  const col = getAdminDb().collection(`users/${userId}/tasks`)
  let q: Query = col
  if (filter === 'open') {
    q = col.where('status', 'in', ['todo', 'doing'])
  } else if (filter === 'today') {
    const from = localDayStart(new Date(), tz)
    const to = new Date(from.getTime() + DAY_MS)
    q = col
      .where('dueAt', '>=', Timestamp.fromDate(from))
      .where('dueAt', '<', Timestamp.fromDate(to))
  }
  const snap = await q.get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Task).sort(compareTasks)
}

export async function getTaskByIndex(
  userId: string,
  filter: 'today' | 'open' | 'all',
  tz: string,
  index1: number,
): Promise<Task | null> {
  const tasks = await listTasks(userId, filter, tz)
  return tasks[index1 - 1] ?? null
}

/** Hard-delete a task doc. Reminders are cancelled separately by the caller. */
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await getAdminDb().doc(`users/${userId}/tasks/${taskId}`).delete()
}

// ─── Notes ────────────────────────────────────────────────────

export async function createNote(userId: string, dto: CreateNoteDTO): Promise<Note> {
  const ref = getAdminDb().collection(`users/${userId}/notes`).doc()
  const now = Timestamp.now()
  const doc = {
    title: dto.title ?? '',
    content: dto.content,
    tags: normalizeTags(dto.tags ?? []),
    source: dto.source,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  await ref.set(stripUndefined(doc))
  return { id: ref.id, ...doc, createdAt: now, updatedAt: now } as unknown as Note
}

export async function listNotes(userId: string, limit = 50): Promise<Note[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/notes`)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Note)
}

export async function searchNotes(userId: string, keyword: string, limit = 20): Promise<Note[]> {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return []
  // ponytail: linear scan; move to a search service beyond ~1000 notes/user
  const notes = await listNotes(userId, 200)
  return notes
    .filter(
      (n) =>
        n.title.toLowerCase().includes(needle) ||
        n.content.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    .slice(0, limit)
}

// ─── Reminders ────────────────────────────────────────────────

export async function createReminder(
  userId: string,
  dto: CreateReminderDTO,
  link: { kind: 'task' | 'standalone'; taskId: string | null },
): Promise<Reminder> {
  const ref = getAdminDb().collection(`users/${userId}/reminders`).doc()
  const now = Timestamp.now()

  let recurrence: Record<string, unknown> | null = null
  if (dto.recurrence) {
    recurrence = {
      freq: dto.recurrence.freq,
      until: dto.recurrence.until ? Timestamp.fromDate(dto.recurrence.until) : null,
    }
    // Weekday is derived from the initial remindAt — CreateReminderDTO has no weekday field.
    if (dto.recurrence.freq === 'weekly') recurrence.weekday = dto.remindAt.getUTCDay()
  }

  const doc = {
    ownerId: userId,
    kind: link.kind,
    taskId: link.taskId,
    message: dto.message,
    remindAt: Timestamp.fromDate(dto.remindAt),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    recurrence,
    source: dto.source,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  await ref.set(stripUndefined(doc))
  return { id: ref.id, ...doc, createdAt: now, updatedAt: now } as unknown as Reminder
}

/** Rebuild a task's automatic reminders: drop the still-pending ones, then re-create
 *  one per lead time whose fire moment is still in the future — for `dueAt` ("jatuh
 *  tempo") and `startAt` ("waktunya mulai", plan §0 #10) alike. No-op if the task has
 *  neither instant.
 *
 *  The bot has no start-date command yet, so the `startAt` loop only fires for a task
 *  whose start was set from the web and that the bot later touches. The mechanism is
 *  what §0 #10 asks for; a `/mulai` command is out of scope. */
export async function upsertTaskReminder(
  userId: string,
  task: Task,
  leadsMinutes: number[],
): Promise<void> {
  if (!task.dueAt && !task.startAt) return

  const db = getAdminDb()
  const col = db.collection(`users/${userId}/reminders`)
  const existing = await col
    .where('kind', '==', 'task')
    .where('taskId', '==', task.id)
    .where('status', '==', 'pending')
    .get()

  const batch = db.batch()
  for (const d of existing.docs) batch.delete(d.ref)

  const tz = await getUserTimezone(userId)
  const nowMs = Date.now()

  const queue = (instant: Date, message: string) => {
    for (const lead of leadsMinutes) {
      const remindMs = instant.getTime() - lead * 60_000
      if (remindMs <= nowMs) continue
      batch.set(
        col.doc(),
        stripUndefined({
          ownerId: userId,
          kind: 'task',
          taskId: task.id,
          message,
          remindAt: Timestamp.fromDate(new Date(remindMs)),
          status: 'pending',
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          sentAt: null,
          recurrence: null,
          source: 'auto',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
      )
    }
  }

  if (task.dueAt) {
    const dueAt = task.dueAt.toDate()
    queue(dueAt, `⏰ Tugas: ${task.title} — jatuh tempo ${formatDateTime(dueAt, tz)}`)
  }
  if (task.startAt) {
    const startAt = task.startAt.toDate()
    queue(startAt, `▶️ Tugas: ${task.title} — waktunya mulai ${formatDateTime(startAt, tz)}`)
  }

  await batch.commit()
}

/** One reminder by id, or `null` if it no longer exists. Used by the button-tap paths
 *  (`mark_done_token`, `snooze` with an explicit id). */
export async function getReminderById(
  userId: string,
  reminderId: string,
): Promise<Reminder | null> {
  const snap = await getAdminDb().doc(`users/${userId}/reminders/${reminderId}`).get()
  return snap.exists ? ({ id: snap.id, ...snap.data() } as unknown as Reminder) : null
}

/** Reminders whose `remindAt` falls inside `now`'s local day in `tz` — mirrors
 *  `listTasks('today')`. Used by the `agenda` command. */
export async function listRemindersForDay(
  userId: string,
  now: Date,
  tz: string,
): Promise<Reminder[]> {
  const from = localDayStart(now, tz)
  const to = new Date(from.getTime() + DAY_MS)
  const snap = await getAdminDb()
    .collection(`users/${userId}/reminders`)
    .where('remindAt', '>=', Timestamp.fromDate(from))
    .where('remindAt', '<', Timestamp.fromDate(to))
    .get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as unknown as Reminder)
    .sort((a, b) => a.remindAt.toMillis() - b.remindAt.toMillis())
}

export async function cancelRemindersForTask(userId: string, taskId: string): Promise<void> {
  const db = getAdminDb()
  const snap = await db
    .collection(`users/${userId}/reminders`)
    .where('kind', '==', 'task')
    .where('taskId', '==', taskId)
    .where('status', '==', 'pending')
    .get()
  if (snap.docs.length === 0) return
  const batch = db.batch()
  for (const d of snap.docs) batch.delete(d.ref)
  await batch.commit()
}

// ─── Cron helpers ─────────────────────────────────────────────

/** `status:'sending'` reminders whose `updatedAt` is older than `cutoff` are assumed
 *  crashed mid-send — flip them back to `pending` so the next run retries them. */
export async function reapStuckSending(cutoff: Date): Promise<number> {
  const db = getAdminDb()
  const snap = await db
    .collectionGroup('reminders')
    .where('status', '==', 'sending')
    .where('updatedAt', '<', Timestamp.fromDate(cutoff))
    .get()
  if (snap.docs.length === 0) return 0
  const batch = db.batch()
  for (const d of snap.docs) {
    batch.update(
      d.ref,
      stripUndefined({ status: 'pending', updatedAt: FieldValue.serverTimestamp() }),
    )
  }
  await batch.commit()
  return snap.docs.length
}

/** The only path shape the cron will deliver from. `collectionGroup('reminders')` matches
 *  at ANY depth, so a doc planted at e.g. `users/{uid}/tasks/{tid}/reminders/{rid}` would
 *  otherwise be picked up — and its `ownerId` FIELD would decide whose chat gets the text. */
const CANONICAL_REMINDER_PATH = /^users\/([^/]+)\/reminders\/[^/]+$/

export async function dueRemindersPage(
  now: Date,
  limit: number,
): Promise<Array<{ ref: DocumentReference; data: Reminder }>> {
  const snap = await getAdminDb()
    .collectionGroup('reminders')
    .where('status', 'in', ['pending', 'failed'])
    .where('remindAt', '<=', Timestamp.fromDate(now))
    .orderBy('remindAt', 'asc')
    .limit(limit)
    .get()

  const out: Array<{ ref: DocumentReference; data: Reminder }> = []
  for (const d of snap.docs) {
    // Skip non-canonical paths outright, and take `ownerId` from the path rather than the
    // field — a writer who controls the field must not be able to address another user.
    const m = CANONICAL_REMINDER_PATH.exec(d.ref.path)
    if (!m) continue
    out.push({
      ref: d.ref,
      data: { ...(d.data() as Reminder), id: d.id, ownerId: m[1] } as unknown as Reminder,
    })
  }
  return out
}

/**
 * The "SKIP LOCKED" primitive: atomically move a reminder from pending/failed to
 * `sending`, bumping `attempts`. Returns `null` when another worker already claimed it
 * or a failed reminder is still in its backoff window.
 */
export async function claimReminder(ref: DocumentReference): Promise<Reminder | null> {
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const r = snap.data() as Reminder
    if (r.status !== 'pending' && r.status !== 'failed') return null
    if (r.status === 'failed' && r.nextAttemptAt && r.nextAttemptAt.toMillis() > Date.now())
      return null
    tx.update(
      ref,
      stripUndefined({ status: 'sending', attempts: r.attempts + 1, updatedAt: Timestamp.now() }),
    )
    return { ...r, id: ref.id, status: 'sending', attempts: r.attempts + 1 } as Reminder
  })
}

export async function markReminderSent(
  ref: DocumentReference,
  next: { rolledAt: Date | null },
): Promise<void> {
  void next.rolledAt // informational — the caller creates the rolled-forward reminder
  await ref.update(
    stripUndefined({
      status: 'sent',
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  )
}

export async function markReminderFailed(
  ref: DocumentReference,
  err: string,
  nextAttemptAt: Date | null,
): Promise<void> {
  await ref.update(
    stripUndefined({
      status: 'failed',
      lastError: err.slice(0, 200),
      nextAttemptAt: nextAttemptAt ? Timestamp.fromDate(nextAttemptAt) : null,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  )
}

// ─── Digest roster ───────────────────────────────────────────

/**
 * Reads the single opt-in roster doc `bot_meta/digestRoster` (`{ [userId]: { tz,
 * digestHour } }`) rather than iterating `users`. Returns the users whose local time is
 * inside `[digestHour:00, digestHour:29]` right now and who have not already been sent
 * today's digest.
 *
 * The window is twice the ~15-min digest tick, so a single dropped tick still lands
 * inside it — at 15 min exactly one tick could fall in the window and a miss lost the day.
 *
 * `tz` comes from the live profile, not the roster line (which is a snapshot taken when
 * prefs were last saved): a user who changes their timezone afterwards would otherwise be
 * scheduled against the old zone forever. `digestHour` still comes from the roster.
 */
export async function usersDueForDigest(
  now: Date,
): Promise<Array<{ userId: string; tz: string; digestHour: number }>> {
  const db = getAdminDb()
  const snap = await db.doc('bot_meta/digestRoster').get()
  if (!snap.exists) return []
  const roster = (snap.data() ?? {}) as Record<string, { tz?: string; digestHour?: number }>

  const out: Array<{ userId: string; tz: string; digestHour: number }> = []
  for (const [userId, entry] of Object.entries(roster)) {
    if (!entry || typeof entry.tz !== 'string' || typeof entry.digestHour !== 'number') continue

    const tz = await getUserTimezone(userId)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1) % 24
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1)
    if (hour !== entry.digestHour || minute > 29) continue

    const digestSnap = await db.doc(`users/${userId}/meta/productivityDigest`).get()
    const lastSentDayKey = digestSnap.exists
      ? (digestSnap.data()?.lastSentDayKey as string | undefined)
      : undefined
    if (lastSentDayKey === dayKeyInTz(now, tz)) continue

    out.push({ userId, tz, digestHour: entry.digestHour })
  }
  return out
}

export async function markDigestSent(userId: string, dayKey: string): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/meta/productivityDigest`)
    .set(stripUndefined({ lastSentDayKey: dayKey }), { merge: true })
}

export async function recordCronRun(row: {
  endpoint: string
  startedAt: Date
  claimed: number
  sent: number
  failed: number
  durationMs: number
}): Promise<void> {
  await getAdminDb()
    .collection('cron_runs')
    .doc()
    .set(
      stripUndefined({
        endpoint: row.endpoint,
        startedAt: Timestamp.fromDate(row.startedAt),
        claimed: row.claimed,
        sent: row.sent,
        failed: row.failed,
        durationMs: row.durationMs,
      }),
    )
}

// ─── Planner prefs ───────────────────────────────────────────

/** Reads `users/{uid}/meta/plannerPrefs`, merged over `DEFAULT_PLANNER_PREFS` so a doc
 *  written by an older build stays valid. */
export async function getPlannerPrefs(userId: string): Promise<PlannerPrefs> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/plannerPrefs`).get()
  if (!snap.exists) return DEFAULT_PLANNER_PREFS
  return { ...DEFAULT_PLANNER_PREFS, ...(snap.data() as Partial<PlannerPrefs>) }
}

/** The id of the last reminder the cron push delivered to this user
 *  (`users/{uid}/meta/plannerLastPush`, written by Task 10). `null` when nothing has
 *  been pushed yet — used to resolve `/tunda N` with no explicit id. */
export async function getPlannerLastPush(userId: string): Promise<string | null> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/plannerLastPush`).get()
  const id = snap.exists ? (snap.data()?.reminderId as string | undefined) : undefined
  return id ?? null
}

/** Record the reminder the cron path just pushed to this user, so an id-less `/tunda N`
 *  can resolve it. Written after a successful send by `/api/cron/reminders`. */
export async function setPlannerLastPush(userId: string, reminderId: string): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/meta/plannerLastPush`)
    .set(stripUndefined({ reminderId, at: FieldValue.serverTimestamp() }), { merge: true })
}

// ─── Planner prefs writes (web Settings → `/api/planner/prefs`) ─────

export interface PlannerPrefsInput {
  digestHour: number
  digestEnabled: boolean
  taskLeadsMinutes: number[]
}

/** Merge-write the planner prefs the cron endpoints (Tasks 10-11) read. Only the route
 *  handler calls this — the client never writes `meta/plannerPrefs` directly. */
export async function setPlannerPrefs(userId: string, prefs: PlannerPrefsInput): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/meta/plannerPrefs`)
    .set(stripUndefined({ ...prefs }), { merge: true })
}

/**
 * Add/update or remove this user's line in the single `bot_meta/digestRoster` doc the
 * daily-digest cron iterates (`{ [userId]: { tz, digestHour } }`).
 *   - `entry === null` → drop the line (digest disabled).
 *   - `entry !== null` → set/update the line.
 */
export async function upsertDigestRoster(
  userId: string,
  entry: { tz: string; digestHour: number } | null,
): Promise<void> {
  const ref = getAdminDb().doc('bot_meta/digestRoster')
  if (entry === null) {
    await ref.set({ [userId]: FieldValue.delete() }, { merge: true })
  } else {
    await ref.set({ [userId]: stripUndefined(entry) }, { merge: true })
  }
}
