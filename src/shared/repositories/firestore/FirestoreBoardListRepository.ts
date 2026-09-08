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
import type { IBoardListRepository } from '../interfaces'
import type { BoardList } from '@/shared/types/board'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.lists

function toBoardList(snap: DocumentSnapshot): BoardList {
  const data = snap.data()!
  return {
    id: snap.id,
    title: data.title ?? '',
    order: data.order ?? 0,
    mapsToStatus: data.mapsToStatus ?? 'todo',
    wipLimit: data.wipLimit ?? null,
    isCollapsed: data.isCollapsed ?? false,
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

export class FirestoreBoardListRepository implements IBoardListRepository {
  async create(
    userId: string,
    data: Omit<BoardList, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<BoardList> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      title: data.title,
      order: data.order,
      mapsToStatus: data.mapsToStatus,
      wipLimit: data.wipLimit,
      isCollapsed: data.isCollapsed,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as BoardList
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<
      Pick<BoardList, 'title' | 'order' | 'mapsToStatus' | 'wipLimit' | 'isCollapsed'>
    >,
  ): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), stripUndefined({ ...patch, updatedAt: serverTimestamp() }))
  }

  async remove(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async list(userId: string): Promise<BoardList[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('order', 'asc')))
    return snap.docs.map(toBoardList)
  }

  watch(userId: string, cb: (lists: BoardList[]) => void): Unsubscribe {
    return onSnapshot(query(col(userId, NAME), orderBy('order', 'asc')), (snap) =>
      cb(snap.docs.map(toBoardList)),
    )
  }
}
