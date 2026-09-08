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
import type { ILabelRepository } from '../interfaces'
import type { Label } from '@/shared/types/board'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.labels

function toLabel(snap: DocumentSnapshot): Label {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name ?? '',
    colorKey: data.colorKey ?? 'slate',
    order: data.order ?? 0,
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreLabelRepository implements ILabelRepository {
  async create(userId: string, data: Omit<Label, 'id' | 'createdAt'>): Promise<Label> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      name: data.name,
      colorKey: data.colorKey,
      order: data.order,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
    return { id: ref.id, ...payload, createdAt: Timestamp.now() } as Label
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Pick<Label, 'name' | 'colorKey' | 'order'>>,
  ): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), stripUndefined({ ...patch }))
  }

  async remove(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async list(userId: string): Promise<Label[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('order', 'asc')))
    return snap.docs.map(toLabel)
  }

  watch(userId: string, cb: (labels: Label[]) => void): Unsubscribe {
    return onSnapshot(query(col(userId, NAME), orderBy('order', 'asc')), (snap) =>
      cb(snap.docs.map(toLabel)),
    )
  }
}
