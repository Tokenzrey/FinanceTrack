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

// ─── Tasks ────────────────────────────────────────────────────

export async function createTask(userId: string, dto: CreateTaskDTO): Promise<Task> {
  const ref = getAdminDb().collection(`users/${userId}/tasks`).doc()
  const now = Timestamp.now()
  const dueAt = dto.dueAt ? Timestamp.fromDate(dto.dueAt) : null
  const doc = {
    title: dto.title,
    notes: dto.notes ?? null,
    status: 'todo',
    priority: dto.priority ?? 'med',
    dueAt,
    doneAt: null,
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
  if (patch.status !== undefined) update.status = patch.status
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt ? Timestamp.fromDate(patch.dueAt) : null
  if (patch.status === 'done' && prev.status !== 'done') update.doneAt = FieldValue.serverTimestamp()

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
    q = col.where('dueAt', '>=', Timestamp.fromDate(from)).where('dueAt', '<', Timestamp.fromDate(to))
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
 *  one per lead time whose fire moment is still in the future. No-op if the task has
 *  no due date. */
export async function upsertTaskReminder(
  userId: string,
  task: Task,
  leadsMinutes: number[],
): Promise<void> {
  if (!task.dueAt) return

  const db = getAdminDb()
  const col = db.collection(`users/${userId}/reminders`)
  const existing = await col
    .where('kind', '==', 'task')
    .where('taskId', '==', task.id)
    .where('status', '==', 'pending')
    .get()

  const batch = db.batch()
  for (const d of existing.docs) batch.delete(d.ref)

  const dueMs = task.dueAt.toDate().getTime()
  const tz = await getUserTimezone(userId)
  const dueLabel = formatDateTime(task.dueAt.toDate(), tz)
  const nowMs = Date.now()

  for (const lead of leadsMinutes) {
    const remindMs = dueMs - lead * 60_000
    if (remindMs <= nowMs) continue
    batch.set(
      col.doc(),
      stripUndefined({
        ownerId: userId,
        kind: 'task',
        taskId: task.id,
        message: `⏰ Tugas: ${task.title} — jatuh tempo ${dueLabel}`,
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

  await batch.commit()
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
    batch.update(d.ref, stripUndefined({ status: 'pending', updatedAt: FieldValue.serverTimestamp() }))
  }
  await batch.commit()
  return snap.docs.length
}

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
  return snap.docs.map((d) => ({
    ref: d.ref,
    data: { id: d.id, ...d.data() } as unknown as Reminder,
  }))
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
    if (r.status === 'failed' && r.nextAttemptAt && r.nextAttemptAt.toMillis() > Date.now()) return null
    tx.update(ref, stripUndefined({ status: 'sending', attempts: r.attempts + 1, updatedAt: Timestamp.now() }))
    return { ...r, status: 'sending', attempts: r.attempts + 1 } as Reminder
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
 * inside `[digestHour:00, digestHour:14]` right now and who have not already been sent
 * today's digest.
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

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: entry.tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1) % 24
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1)
    if (hour !== entry.digestHour || minute > 14) continue

    const digestSnap = await db.doc(`users/${userId}/meta/productivityDigest`).get()
    const lastSentDayKey = digestSnap.exists
      ? (digestSnap.data()?.lastSentDayKey as string | undefined)
      : undefined
    if (lastSentDayKey === dayKeyInTz(now, entry.tz)) continue

    out.push({ userId, tz: entry.tz, digestHour: entry.digestHour })
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
