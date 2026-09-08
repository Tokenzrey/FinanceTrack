import {
  Timestamp,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import type { ITaskRepository } from '../interfaces'
import type { CreateTaskDTO, Task, UpdateTaskDTO } from '@/shared/types/productivity'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.tasks

/** Exported for tests — pure mapping, no Firestore access beyond the snapshot. */
export function toTask(snap: DocumentSnapshot): Task {
  const data = snap.data()!
  return {
    id: snap.id,
    title: data.title ?? '',
    notes: data.notes ?? null,
    status: data.status ?? 'todo',
    priority: data.priority ?? 'med',
    dueAt: data.dueAt ?? null,
    doneAt: data.doneAt ?? null,
    source: data.source ?? 'web',
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
    // Board fields — optional on `Task`, so a bot-created doc without them stays
    // valid. Defaults must be read-safe: `listId: null` matches no column (the
    // migration's job), empty arrays keep every `?? []` consumer happy.
    listId: data.listId ?? null,
    order: data.order ?? 0,
    startAt: data.startAt ?? null,
    labelIds: data.labelIds ?? [],
    storyPoints: data.storyPoints ?? null,
    dependsOn: data.dependsOn ?? [],
    checklist: data.checklist ?? [],
    attachments: data.attachments ?? [],
    progressNotes: data.progressNotes ?? [],
    coverColor: data.coverColor ?? null,
  }
}

/** `dueAt` ascending with nulls last, then `createdAt` ascending. */
function compareTasks(a: Task, b: Task): number {
  const ad = a.dueAt ? a.dueAt.toMillis() : Number.POSITIVE_INFINITY
  const bd = b.dueAt ? b.dueAt.toMillis() : Number.POSITIVE_INFINITY
  if (ad !== bd) return ad - bd
  return a.createdAt.toMillis() - b.createdAt.toMillis()
}

export class FirestoreTaskRepository implements ITaskRepository {
  async create(userId: string, dto: CreateTaskDTO): Promise<Task> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      title: dto.title,
      notes: dto.notes ?? null,
      status: 'todo' as const,
      priority: dto.priority ?? 'med',
      dueAt: dto.dueAt ? Timestamp.fromDate(dto.dueAt) : null,
      doneAt: null,
      source: dto.source,
      // `stripUndefined` drops these when the caller didn't set them, so a task
      // created without a column writes no `listId` field at all.
      listId: dto.listId ?? undefined,
      order: dto.order ?? undefined,
      labelIds: dto.labelIds ?? undefined,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as Task
  }

  async update(userId: string, id: string, patch: UpdateTaskDTO): Promise<void> {
    const data: Record<string, unknown> = stripUndefined({
      ...patch,
      dueAt:
        patch.dueAt !== undefined
          ? patch.dueAt
            ? Timestamp.fromDate(patch.dueAt)
            : null
          : undefined,
      startAt:
        patch.startAt !== undefined
          ? patch.startAt
            ? Timestamp.fromDate(patch.startAt)
            : null
          : undefined,
      doneAt: patch.status === 'done' ? serverTimestamp() : undefined,
    })
    await updateDoc(colDoc(userId, NAME, id), { ...data, updatedAt: serverTimestamp() })
  }

  async remove(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async list(userId: string, filter: 'today' | 'open' | 'all'): Promise<Task[]> {
    // `'today'` needs the user's timezone to bound a local day; the web page filters
    // that itself. Only `'open'` gets a server-side clause here.
    const source =
      filter === 'open'
        ? query(col(userId, NAME), where('status', 'in', ['todo', 'doing']))
        : col(userId, NAME)
    const snap = await getDocs(source)
    return snap.docs.map(toTask).sort(compareTasks)
  }

  watch(userId: string, cb: (tasks: Task[]) => void): Unsubscribe {
    return onSnapshot(col(userId, NAME), (snap) => cb(snap.docs.map(toTask).sort(compareTasks)))
  }
}
