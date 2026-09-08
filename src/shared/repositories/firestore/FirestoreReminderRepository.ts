import {
  Timestamp,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import type { IReminderRepository } from '../interfaces'
import type { CreateReminderDTO, Reminder, ReminderRecurrence } from '@/shared/types/productivity'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.reminders

function toReminder(snap: DocumentSnapshot): Reminder {
  const data = snap.data()!
  return {
    id: snap.id,
    ownerId: data.ownerId,
    kind: data.kind ?? 'standalone',
    taskId: data.taskId ?? null,
    message: data.message ?? '',
    remindAt: data.remindAt ?? Timestamp.now(),
    status: data.status ?? 'pending',
    attempts: data.attempts ?? 0,
    nextAttemptAt: data.nextAttemptAt ?? null,
    lastError: data.lastError ?? null,
    sentAt: data.sentAt ?? null,
    recurrence: data.recurrence ?? null,
    source: data.source ?? 'web',
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

export class FirestoreReminderRepository implements IReminderRepository {
  async create(userId: string, dto: CreateReminderDTO): Promise<Reminder> {
    const ref = newDoc(userId, NAME)

    let recurrence: ReminderRecurrence | null = null
    if (dto.recurrence) {
      recurrence = {
        freq: dto.recurrence.freq,
        until: dto.recurrence.until ? Timestamp.fromDate(dto.recurrence.until) : null,
      }
      // Weekday is derived from the initial remindAt — CreateReminderDTO has no weekday field.
      if (dto.recurrence.freq === 'weekly') recurrence.weekday = dto.remindAt.getUTCDay()
    }

    // firestore.rules (Task 1) enforces status:'pending', attempts:0, ownerId:userId on create.
    const payload = stripUndefined({
      ownerId: userId,
      kind: 'standalone' as const,
      taskId: null,
      message: dto.message,
      remindAt: Timestamp.fromDate(dto.remindAt),
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      sentAt: null,
      recurrence,
      source: dto.source,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as Reminder
  }

  async listUpcoming(userId: string): Promise<Reminder[]> {
    const snap = await getDocs(
      query(
        col(userId, NAME),
        where('status', 'in', ['pending', 'failed']),
        orderBy('remindAt', 'asc'),
      ),
    )
    return snap.docs.map(toReminder)
  }

  async cancel(userId: string, id: string): Promise<void> {
    // Rules allow the client to move status only to 'cancelled'.
    await updateDoc(colDoc(userId, NAME, id), { status: 'cancelled', updatedAt: serverTimestamp() })
  }

  /** Same filter as `listUpcoming` — a daily recurring reminder leaves one `sent` doc per
   *  day, and re-reading the whole history on every planner load is pure waste. */
  watch(userId: string, cb: (reminders: Reminder[]) => void): Unsubscribe {
    return onSnapshot(
      query(
        col(userId, NAME),
        where('status', 'in', ['pending', 'failed']),
        orderBy('remindAt', 'asc'),
      ),
      (snap) => cb(snap.docs.map(toReminder)),
    )
  }
}
