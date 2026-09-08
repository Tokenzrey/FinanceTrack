import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { DEFAULT_PLANNER_PREFS } from '@/shared/types/productivity'
import type { Task } from '@/shared/types/productivity'

const getAdminDb = vi.fn()
vi.mock('@/shared/lib/firebase-admin', () => ({
  getAdminDb: () => getAdminDb(),
}))

const {
  createTask,
  listTasks,
  createReminder,
  claimReminder,
  dueRemindersPage,
  upsertTaskReminder,
  searchNotes,
  reapStuckSending,
  getPlannerPrefs,
  getPlannerLastPush,
  setPlannerLastPush,
  setPlannerPrefs,
  upsertDigestRoster,
  getReminderById,
  listRemindersForDay,
  deleteTask,
} = await import('./admin-data-productivity')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Shared in-memory Firestore query fake ──────────────────────
// Mirrors the per-test inline mocks in admin-data.test.ts, but adds a query fake that
// actually applies where/orderBy/limit so the tests assert real filtering, not "the
// mock returned what I handed it".

interface FakeDoc {
  id: string
  data: () => Record<string, unknown>
  ref: { id: string; path: string }
}

function mkDoc(id: string, data: Record<string, unknown>, path?: string): FakeDoc {
  return { id, data: () => data, ref: { id, path: path ?? `users/u1/reminders/${id}` } }
}

const asMillis = (v: unknown): unknown =>
  v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis()
    : v

function applyWhere(docs: FakeDoc[], field: string, op: string, value: unknown): FakeDoc[] {
  return docs.filter((d) => {
    const raw = d.data()[field]
    const cur = asMillis(raw)
    const cmp = asMillis(value)
    switch (op) {
      case '==':
        return cur === cmp
      case '<':
        return (cur as number) < (cmp as number)
      case '<=':
        return (cur as number) <= (cmp as number)
      case '>=':
        return (cur as number) >= (cmp as number)
      case 'in':
        return Array.isArray(value) && value.includes(raw)
      default:
        return true
    }
  })
}

interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery
  orderBy: (field: string, dir?: 'asc' | 'desc') => FakeQuery
  limit: (n: number) => FakeQuery
  get: () => Promise<{ docs: FakeDoc[]; empty: boolean; size: number }>
}

function fakeQuery(docs: FakeDoc[]): FakeQuery {
  return {
    where: (field, op, value) => fakeQuery(applyWhere(docs, field, op, value)),
    orderBy: (field, dir = 'asc') =>
      fakeQuery(
        [...docs].sort((a, b) => {
          const av = asMillis(a.data()[field]) as number
          const bv = asMillis(b.data()[field]) as number
          return dir === 'desc' ? bv - av : av - bv
        }),
      ),
    limit: (n) => fakeQuery(docs.slice(0, n)),
    get: async () => ({ docs, empty: docs.length === 0, size: docs.length }),
  }
}

// ─── createTask ────────────────────────────────────────────────

describe('createTask', () => {
  it('defaults status=todo priority=med, preserves title, stamps timestamps, nulls notes/dueAt', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const doc = vi.fn().mockReturnValue({ id: 'task-1', set })
    getAdminDb.mockReturnValue({ collection: vi.fn().mockReturnValue({ doc }) })

    const t = await createTask('u1', { title: 'Review PRD', source: 'whatsapp' })

    expect(t.id).toBe('task-1')
    expect(t.status).toBe('todo')
    expect(t.priority).toBe('med')
    expect(t.title).toBe('Review PRD')
    expect(t.createdAt).toBeTruthy()
    expect(t.updatedAt).toBeTruthy()

    const written = set.mock.calls[0][0] as Record<string, unknown>
    expect(written.status).toBe('todo')
    expect(written.priority).toBe('med')
    expect(written.notes).toBeNull()
    expect(written.doneAt).toBeNull()
    expect('dueAt' in written).toBe(true)
    expect(written.dueAt).toBeNull()
  })

  it('converts a dto.dueAt Date to a Timestamp and honours an explicit priority', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ id: 'task-2', set }) }),
    })

    const due = new Date('2026-09-20T09:00:00Z')
    const t = await createTask('u1', { title: 'x', source: 'web', priority: 'high', dueAt: due })

    expect(t.priority).toBe('high')
    const written = set.mock.calls[0][0] as { dueAt: { toMillis: () => number } }
    expect(written.dueAt.toMillis()).toBe(due.getTime())
  })
})

// ─── listTasks ────────────────────────────────────────────────

describe('listTasks', () => {
  it("'open' filters to todo/doing and orders by dueAt asc then createdAt asc (nulls last)", async () => {
    const docs = [
      mkDoc('a', { status: 'todo', dueAt: null, createdAt: { toMillis: () => 100 } }),
      mkDoc('b', { status: 'doing', dueAt: { toMillis: () => 5_000 }, createdAt: { toMillis: () => 1 } }),
      mkDoc('c', { status: 'todo', dueAt: { toMillis: () => 1_000 }, createdAt: { toMillis: () => 1 } }),
    ]
    const where = vi.fn().mockReturnValue(fakeQuery(docs))
    getAdminDb.mockReturnValue({ collection: vi.fn().mockReturnValue({ where }) })

    const out = await listTasks('u1', 'open', 'Asia/Jakarta')

    expect(where).toHaveBeenCalledWith('status', 'in', ['todo', 'doing'])
    expect(out.map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })

  it("'today' bounds dueAt to [localMidnight, nextLocalMidnight) in the given tz", async () => {
    // now = 12:00 on 2026-09-08 in Asia/Jakarta (UTC+7, no DST).
    // → local day window is [2026-09-07T17:00Z, 2026-09-08T17:00Z).
    vi.setSystemTime(new Date('2026-09-08T05:00:00Z'))
    const fromMs = Date.parse('2026-09-07T17:00:00Z')

    const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
    const docs = [
      mkDoc('before', { status: 'todo', dueAt: ts('2026-09-07T16:59:00Z'), createdAt: { toMillis: () => 1 } }),
      mkDoc('at-open', { status: 'todo', dueAt: ts('2026-09-07T17:00:00Z'), createdAt: { toMillis: () => 1 } }),
      mkDoc('midday', { status: 'done', dueAt: ts('2026-09-08T10:00:00Z'), createdAt: { toMillis: () => 1 } }),
      mkDoc('at-close', { status: 'todo', dueAt: ts('2026-09-08T17:00:00Z'), createdAt: { toMillis: () => 1 } }),
      mkDoc('after', { status: 'todo', dueAt: ts('2026-09-08T20:00:00Z'), createdAt: { toMillis: () => 1 } }),
    ]
    const base = fakeQuery(docs)
    const where = vi.fn((f: string, op: string, v: unknown) => base.where(f, op, v))
    getAdminDb.mockReturnValue({ collection: vi.fn().mockReturnValue({ where }) })

    const out = await listTasks('u1', 'today', 'Asia/Jakarta')

    // Boundary math: the first where() clause carries the local-midnight lower bound.
    expect(where.mock.calls[0][0]).toBe('dueAt')
    expect(where.mock.calls[0][1]).toBe('>=')
    expect((where.mock.calls[0][2] as { toMillis: () => number }).toMillis()).toBe(fromMs)
    // Half-open window applied end to end: 'at-open' kept, 'before'/'at-close'/'after' dropped.
    expect(out.map((t) => t.id)).toEqual(['at-open', 'midday'])
  })
})

// ─── createReminder ───────────────────────────────────────────

describe('createReminder', () => {
  it('standalone link → taskId null, status pending, attempts 0, nextAttemptAt null', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ id: 'rem-1', set }) }),
    })

    const r = await createReminder(
      'u1',
      { message: 'Bayar listrik', remindAt: new Date('2026-09-10T02:00:00Z'), source: 'whatsapp' },
      { kind: 'standalone', taskId: null },
    )

    expect(r.taskId).toBeNull()
    expect(r.kind).toBe('standalone')
    expect(r.status).toBe('pending')
    expect(r.attempts).toBe(0)
    expect(r.nextAttemptAt).toBeNull()
    expect(r.recurrence).toBeNull()
    const written = set.mock.calls[0][0] as Record<string, unknown>
    expect(written.ownerId).toBe('u1')
    expect(written.sentAt).toBeNull()
  })

  it('weekly recurrence gets a weekday derived from remindAt.getUTCDay()', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ id: 'rem-2', set }) }),
    })

    const remindAt = new Date('2026-09-09T02:00:00Z')
    const r = await createReminder(
      'u1',
      { message: 'Standup', remindAt, recurrence: { freq: 'weekly' }, source: 'web' },
      { kind: 'standalone', taskId: null },
    )

    expect(r.recurrence?.freq).toBe('weekly')
    expect(r.recurrence?.weekday).toBe(remindAt.getUTCDay())
    const written = set.mock.calls[0][0] as { recurrence: Record<string, unknown> }
    expect(written.recurrence.weekday).toBe(remindAt.getUTCDay())
    expect(written.recurrence.until).toBeNull()
  })

  it('non-weekly recurrence carries no weekday key', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ id: 'rem-3', set }) }),
    })

    await createReminder(
      'u1',
      {
        message: 'x',
        remindAt: new Date('2026-09-09T02:00:00Z'),
        recurrence: { freq: 'daily', until: new Date('2026-12-01T00:00:00Z') },
        source: 'web',
      },
      { kind: 'standalone', taskId: null },
    )

    const written = set.mock.calls[0][0] as { recurrence: Record<string, unknown> }
    expect('weekday' in written.recurrence).toBe(false)
    expect((written.recurrence.until as { toMillis: () => number }).toMillis()).toBe(
      new Date('2026-12-01T00:00:00Z').getTime(),
    )
  })
})

// ─── claimReminder ────────────────────────────────────────────

describe('claimReminder', () => {
  function txDb(initial: Record<string, unknown>) {
    const state: { data: Record<string, unknown>; exists: boolean } = { data: { ...initial }, exists: true }
    const txGet = vi.fn(async () => ({ exists: state.exists, data: () => state.data }))
    const txUpdate = vi.fn((_ref: unknown, patch: Record<string, unknown>) => {
      state.data = { ...state.data, ...patch }
    })
    const db = {
      doc: vi.fn().mockReturnValue({ id: 'rem-1' }),
      runTransaction: (fn: (tx: { get: typeof txGet; update: typeof txUpdate }) => unknown) =>
        fn({ get: txGet, update: txUpdate }),
    }
    return { db, txGet, txUpdate }
  }

  it('pending → returns sending with attempts bumped; a second claim on the now-sending doc returns null', async () => {
    const { db, txUpdate } = txDb({ status: 'pending', attempts: 2, nextAttemptAt: null })
    getAdminDb.mockReturnValue(db)
    const ref = getAdminDb().doc('users/u1/reminders/rem-1')

    const first = await claimReminder(ref)
    const second = await claimReminder(ref)

    expect(first?.status).toBe('sending')
    expect(first?.attempts).toBe(3)
    expect(second).toBeNull()
    expect(txUpdate).toHaveBeenCalledTimes(1)
  })

  it('a failed reminder whose nextAttemptAt is still in the future is not claimable', async () => {
    const { db } = txDb({
      status: 'failed',
      attempts: 1,
      nextAttemptAt: { toMillis: () => Date.now() + 60_000 },
    })
    getAdminDb.mockReturnValue(db)
    const ref = getAdminDb().doc('users/u1/reminders/rem-1')

    expect(await claimReminder(ref)).toBeNull()
  })
})

// ─── dueRemindersPage ─────────────────────────────────────────

describe('dueRemindersPage', () => {
  it('returns pending/failed reminders due by `now`, oldest first, with their refs', async () => {
    const now = new Date('2026-09-08T12:00:00Z')
    const docs = [
      mkDoc('r1', { status: 'pending', remindAt: Timestamp.fromDate(new Date('2026-09-08T11:00:00Z')) }),
      mkDoc('r2', { status: 'sent', remindAt: Timestamp.fromDate(new Date('2026-09-08T10:00:00Z')) }),
      mkDoc('r3', { status: 'failed', remindAt: Timestamp.fromDate(new Date('2026-09-08T09:00:00Z')) }),
      mkDoc('r4', { status: 'pending', remindAt: Timestamp.fromDate(new Date('2026-09-08T13:00:00Z')) }),
    ]
    getAdminDb.mockReturnValue({ collectionGroup: vi.fn().mockReturnValue(fakeQuery(docs)) })

    const page = await dueRemindersPage(now, 10)

    expect(page.map((p) => p.data.id)).toEqual(['r3', 'r1'])
    expect(page[0].ref.id).toBe('r3')
  })

  it('drops nested-path docs and derives ownerId from the path, never from the field', async () => {
    const now = new Date('2026-09-08T12:00:00Z')
    const due = Timestamp.fromDate(new Date('2026-09-08T11:00:00Z'))
    const docs = [
      // Planted by an authed attacker under their own tasks subtree, addressed at a victim.
      mkDoc(
        'evil',
        { status: 'pending', remindAt: due, ownerId: 'victim' },
        'users/attacker/tasks/t1/reminders/evil',
      ),
      // Canonical doc whose ownerId field lies about who owns it.
      mkDoc('ok', { status: 'pending', remindAt: due, ownerId: 'victim' }),
    ]
    getAdminDb.mockReturnValue({ collectionGroup: vi.fn().mockReturnValue(fakeQuery(docs)) })

    const page = await dueRemindersPage(now, 10)

    expect(page.map((p) => p.data.id)).toEqual(['ok'])
    expect(page[0].data.ownerId).toBe('u1')
  })
})

// ─── upsertTaskReminder ───────────────────────────────────────

describe('upsertTaskReminder', () => {
  it('is a no-op when the task has no dueAt', async () => {
    const db = { collection: vi.fn() }
    getAdminDb.mockReturnValue(db)

    await upsertTaskReminder('u1', { id: 't1', title: 'x', dueAt: null } as unknown as Task, [0, 60])

    expect(db.collection).not.toHaveBeenCalled()
  })

  it('deletes existing pending task reminders then creates one per future lead, skipping past leads', async () => {
    const existing = [mkDoc('old-1', { kind: 'task', taskId: 't1', status: 'pending' })]
    const batchDelete = vi.fn()
    const batchSet = vi.fn()
    const batchCommit = vi.fn().mockResolvedValue(undefined)
    const col = { ...fakeQuery(existing), doc: vi.fn().mockReturnValue({ id: 'new-rem' }) }
    getAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue(col),
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
      batch: vi.fn().mockReturnValue({ delete: batchDelete, set: batchSet, commit: batchCommit }),
    })

    const dueAt = { toDate: () => new Date(Date.now() + 30 * 60_000) }
    await upsertTaskReminder(
      'u1',
      { id: 't1', title: 'Kirim laporan', dueAt } as unknown as Task,
      [0, 60], // lead 0 → +30min (future, kept); lead 60 → -30min (past, skipped)
    )

    expect(batchDelete).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchCommit).toHaveBeenCalledTimes(1)
    const written = batchSet.mock.calls[0][1] as Record<string, unknown>
    expect(written.kind).toBe('task')
    expect(written.taskId).toBe('t1')
    expect(written.source).toBe('auto')
    expect(written.message).toContain('⏰ Tugas: Kirim laporan — jatuh tempo ')
  })
})

// ─── searchNotes ──────────────────────────────────────────────

describe('searchNotes', () => {
  it('matches case-insensitively across title, content and tags; excludes non-matches', async () => {
    const docs = [
      mkDoc('n1', { title: 'Meeting NOTES', content: 'discuss roadmap', tags: [], source: 'web' }),
      mkDoc('n2', { title: 'Groceries', content: 'Milk and EGGS', tags: [], source: 'web' }),
      mkDoc('n3', { title: 'Ideas', content: 'nothing here', tags: ['Roadmap', 'q4'], source: 'web' }),
      mkDoc('n4', { title: 'Unrelated', content: 'blah', tags: ['misc'], source: 'web' }),
    ]
    getAdminDb.mockReturnValue({ collection: vi.fn().mockReturnValue(fakeQuery(docs)) })

    const roadmap = await searchNotes('u1', 'ROADMAP')
    expect(roadmap.map((n) => n.id).sort()).toEqual(['n1', 'n3'])

    const eggs = await searchNotes('u1', 'eggs')
    expect(eggs.map((n) => n.id)).toEqual(['n2'])

    const none = await searchNotes('u1', 'zzz-nope')
    expect(none).toEqual([])
  })
})

// ─── reapStuckSending ─────────────────────────────────────────

describe('reapStuckSending', () => {
  it('flips only sending docs older than cutoff back to pending and returns the count', async () => {
    const cutoff = new Date('2026-09-08T12:00:00Z')
    const older = Timestamp.fromDate(new Date('2026-09-08T11:00:00Z'))
    const newer = Timestamp.fromDate(new Date('2026-09-08T13:00:00Z'))
    const docs = [
      mkDoc('r1', { status: 'sending', updatedAt: older }),
      mkDoc('r2', { status: 'sending', updatedAt: newer }),
      mkDoc('r3', { status: 'pending', updatedAt: older }),
      mkDoc('r4', { status: 'sending', updatedAt: older }),
    ]
    const batchUpdate = vi.fn()
    const batchCommit = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collectionGroup: vi.fn().mockReturnValue(fakeQuery(docs)),
      batch: vi.fn().mockReturnValue({ update: batchUpdate, commit: batchCommit }),
    })

    const n = await reapStuckSending(cutoff)

    expect(n).toBe(2)
    expect(batchUpdate).toHaveBeenCalledTimes(2)
    expect((batchUpdate.mock.calls[0][1] as Record<string, unknown>).status).toBe('pending')
  })

  it('returns 0 and commits nothing when no doc is stuck', async () => {
    const batchCommit = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({
      collectionGroup: vi.fn().mockReturnValue(fakeQuery([])),
      batch: vi.fn().mockReturnValue({ update: vi.fn(), commit: batchCommit }),
    })

    expect(await reapStuckSending(new Date())).toBe(0)
    expect(batchCommit).not.toHaveBeenCalled()
  })
})

// ─── getPlannerPrefs ──────────────────────────────────────────

describe('getPlannerPrefs', () => {
  it('returns DEFAULT_PLANNER_PREFS when the doc is missing', async () => {
    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
    })

    expect(await getPlannerPrefs('u1')).toEqual(DEFAULT_PLANNER_PREFS)
  })

  it('merges a partial doc over the defaults', async () => {
    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ digestHour: 9 }) }),
      }),
    })

    const merged = await getPlannerPrefs('u1')
    expect(merged).toEqual({ ...DEFAULT_PLANNER_PREFS, digestHour: 9 })
    expect(merged.taskLeadsMinutes).toEqual(DEFAULT_PLANNER_PREFS.taskLeadsMinutes)
    expect(merged.digestEnabled).toBe(DEFAULT_PLANNER_PREFS.digestEnabled)
  })
})

// ─── getPlannerLastPush ───────────────────────────────────────

describe('getPlannerLastPush', () => {
  it('returns the stored reminderId, or null when the doc is missing', async () => {
    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ reminderId: 'rem-9' }) }),
      }),
    })
    expect(await getPlannerLastPush('u1')).toBe('rem-9')

    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
    })
    expect(await getPlannerLastPush('u1')).toBeNull()
  })
})

// ─── setPlannerLastPush ───────────────────────────────────────

describe('setPlannerLastPush', () => {
  it('merges the reminderId + a server timestamp into the meta doc', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const doc = vi.fn().mockReturnValue({ set })
    getAdminDb.mockReturnValue({ doc })

    await setPlannerLastPush('u1', 'rem-7')

    expect(doc).toHaveBeenCalledWith('users/u1/meta/plannerLastPush')
    const [payload, opts] = set.mock.calls[0]
    expect((payload as Record<string, unknown>).reminderId).toBe('rem-7')
    expect(opts).toEqual({ merge: true })
  })
})

// ─── setPlannerPrefs ─────────────────────────────────────────

describe('setPlannerPrefs', () => {
  it('merge-writes the prefs doc at users/{uid}/meta/plannerPrefs', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const doc = vi.fn().mockReturnValue({ set })
    getAdminDb.mockReturnValue({ doc })

    await setPlannerPrefs('u1', { digestHour: 6, digestEnabled: true, taskLeadsMinutes: [0, 60] })

    expect(doc).toHaveBeenCalledWith('users/u1/meta/plannerPrefs')
    const [payload, opts] = set.mock.calls[0]
    expect(payload).toMatchObject({
      digestHour: 6,
      digestEnabled: true,
      taskLeadsMinutes: [0, 60],
    })
    expect(opts).toEqual({ merge: true })
  })
})

// ─── upsertDigestRoster ──────────────────────────────────────

describe('upsertDigestRoster', () => {
  it('sets {[uid]: {tz, digestHour}} on the roster doc for a real entry', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const doc = vi.fn().mockReturnValue({ set })
    getAdminDb.mockReturnValue({ doc })

    await upsertDigestRoster('u1', { tz: 'Asia/Jakarta', digestHour: 6 })

    expect(doc).toHaveBeenCalledWith('bot_meta/digestRoster')
    const [payload, opts] = set.mock.calls[0]
    expect(payload).toEqual({ u1: { tz: 'Asia/Jakarta', digestHour: 6 } })
    expect(opts).toEqual({ merge: true })
  })

  it('sets {[uid]: <FieldValue.delete sentinel>} when the entry is null', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    getAdminDb.mockReturnValue({ doc: vi.fn().mockReturnValue({ set }) })

    await upsertDigestRoster('u1', null)

    const [payload, opts] = set.mock.calls[0] as [Record<string, unknown>, unknown]
    expect('u1' in payload).toBe(true)
    expect(payload.u1).toBe(FieldValue.delete())
    expect(opts).toEqual({ merge: true })
  })
})

// ─── getReminderById ──────────────────────────────────────────

describe('getReminderById', () => {
  it('hydrates the doc with its id, or returns null when it does not exist', async () => {
    const doc = vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: true, id: 'rem-1', data: () => ({ message: 'Bayar listrik', kind: 'standalone' }) }),
    })
    getAdminDb.mockReturnValue({ doc })
    const r = await getReminderById('u1', 'rem-1')
    expect(doc).toHaveBeenCalledWith('users/u1/reminders/rem-1')
    expect(r).toMatchObject({ id: 'rem-1', message: 'Bayar listrik' })

    getAdminDb.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
    })
    expect(await getReminderById('u1', 'nope')).toBeNull()
  })
})

// ─── listRemindersForDay ──────────────────────────────────────

describe('listRemindersForDay', () => {
  it('bounds remindAt to the local-day window and returns results oldest-first', async () => {
    const now = new Date('2026-09-08T05:00:00Z') // 12:00 in Asia/Jakarta (UTC+7)
    const fromMs = Date.parse('2026-09-07T17:00:00Z')
    const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
    const docs = [
      mkDoc('late', { remindAt: ts('2026-09-08T14:00:00Z') }),
      mkDoc('before', { remindAt: ts('2026-09-07T16:00:00Z') }),
      mkDoc('early', { remindAt: ts('2026-09-08T02:00:00Z') }),
    ]
    const base = fakeQuery(docs)
    const where = vi.fn((f: string, op: string, v: unknown) => base.where(f, op, v))
    getAdminDb.mockReturnValue({ collection: vi.fn().mockReturnValue({ where }) })

    const out = await listRemindersForDay('u1', now, 'Asia/Jakarta')

    expect(where.mock.calls[0][0]).toBe('remindAt')
    expect(where.mock.calls[0][1]).toBe('>=')
    expect((where.mock.calls[0][2] as { toMillis: () => number }).toMillis()).toBe(fromMs)
    expect(out.map((r) => r.id)).toEqual(['early', 'late'])
  })
})

// ─── deleteTask ──────────────────────────────────────────────

describe('deleteTask', () => {
  it('deletes the task doc at the expected path', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    const doc = vi.fn().mockReturnValue({ delete: del })
    getAdminDb.mockReturnValue({ doc })

    await deleteTask('u1', 't1')

    expect(doc).toHaveBeenCalledWith('users/u1/tasks/t1')
    expect(del).toHaveBeenCalledTimes(1)
  })
})
