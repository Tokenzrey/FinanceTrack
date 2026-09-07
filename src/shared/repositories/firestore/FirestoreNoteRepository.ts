import {
  Timestamp,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import type { INoteRepository } from '../interfaces'
import { normalizeTags, type CreateNoteDTO, type Note } from '@/shared/types/productivity'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.notes

type UpdateNotePatch = Partial<Pick<Note, 'title' | 'content' | 'tags'>>

function toNote(snap: DocumentSnapshot): Note {
  const data = snap.data()!
  return {
    id: snap.id,
    title: data.title ?? '',
    content: data.content ?? '',
    tags: data.tags ?? [],
    source: data.source ?? 'web',
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

export class FirestoreNoteRepository implements INoteRepository {
  async create(userId: string, dto: CreateNoteDTO): Promise<Note> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      title: dto.title ?? '',
      content: dto.content,
      tags: normalizeTags(dto.tags ?? []),
      source: dto.source,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as Note
  }

  async update(userId: string, id: string, patch: UpdateNotePatch): Promise<void> {
    const data: Record<string, unknown> = stripUndefined({
      ...patch,
      tags: patch.tags ? normalizeTags(patch.tags) : undefined,
    })
    await updateDoc(colDoc(userId, NAME, id), { ...data, updatedAt: serverTimestamp() })
  }

  async remove(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async list(userId: string): Promise<Note[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('updatedAt', 'desc')))
    return snap.docs.map(toNote)
  }

  watch(userId: string, cb: (notes: Note[]) => void): Unsubscribe {
    return onSnapshot(col(userId, NAME), (snap) => cb(snap.docs.map(toNote)))
  }
}
