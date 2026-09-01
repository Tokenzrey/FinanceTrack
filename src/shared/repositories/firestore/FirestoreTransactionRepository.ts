import {
  Timestamp,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import type { ITransactionRepository } from '../interfaces'
import type { Pillar, Transaction } from '@/shared/types/domain'
import type { CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types/dto'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.transactions

/** Firestore batches cap at 500 writes. */
const BATCH_LIMIT = 500

function toTransaction(snap: QueryDocumentSnapshot): Transaction {
  const data = snap.data()
  return {
    id: snap.id,
    date: data.date,
    type: data.type,
    pillar: data.pillar,
    categoryId: data.categoryId,
    categoryItemId: data.categoryItemId,
    amount: data.amount,
    description: data.description,
    tags: data.tags ?? [],
    paymentMethod: data.paymentMethod,
    receiptUrl: data.receiptUrl,
    receiptThumbnailUrl: data.receiptThumbnailUrl,
    gDriveFileId: data.gDriveFileId,
    gDriveWebViewLink: data.gDriveWebViewLink,
    gDriveThumbnailLink: data.gDriveThumbnailLink,
    isRecurring: data.isRecurring ?? false,
    recurringRuleId: data.recurringRuleId,
    location: data.location,
    mood: data.mood,
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

/** First instant of the month, and the first instant of the next month. */
function monthBounds(year: number, month: number): [Timestamp, Timestamp] {
  return [
    Timestamp.fromDate(new Date(year, month - 1, 1, 0, 0, 0, 0)),
    Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0, 0)),
  ]
}

function toWriteModel(data: CreateTransactionDTO) {
  return stripUndefined({
    date: Timestamp.fromDate(data.date),
    type: data.type,
    pillar: data.pillar,
    categoryId: data.categoryId,
    categoryItemId: data.categoryItemId,
    amount: Math.abs(data.amount),
    description: data.description,
    tags: data.tags ?? [],
    paymentMethod: data.paymentMethod,
    receiptUrl: data.receiptUrl,
    receiptThumbnailUrl: data.receiptThumbnailUrl,
    gDriveFileId: data.gDriveFileId,
    gDriveWebViewLink: data.gDriveWebViewLink,
    gDriveThumbnailLink: data.gDriveThumbnailLink,
    isRecurring: data.isRecurring ?? false,
    recurringRuleId: data.recurringRuleId,
    location: data.location,
    mood: data.mood,
  })
}

export class FirestoreTransactionRepository implements ITransactionRepository {
  async findById(userId: string, id: string): Promise<Transaction | null> {
    const snap = await getDoc(colDoc(userId, NAME, id))
    return snap.exists() ? toTransaction(snap) : null
  }

  async findByMonth(userId: string, year: number, month: number): Promise<Transaction[]> {
    const [from, to] = monthBounds(year, month)
    const snap = await getDocs(
      query(
        col(userId, NAME),
        where('date', '>=', from),
        where('date', '<', to),
        orderBy('date', 'desc'),
      ),
    )
    return snap.docs.map(toTransaction)
  }

  async findByDateRange(userId: string, from: Date, to: Date): Promise<Transaction[]> {
    const snap = await getDocs(
      query(
        col(userId, NAME),
        where('date', '>=', Timestamp.fromDate(from)),
        where('date', '<=', Timestamp.fromDate(to)),
        orderBy('date', 'desc'),
      ),
    )
    return snap.docs.map(toTransaction)
  }

  async findByCategory(userId: string, categoryId: string, limit = 100): Promise<Transaction[]> {
    const snap = await getDocs(
      query(
        col(userId, NAME),
        where('categoryId', '==', categoryId),
        orderBy('date', 'desc'),
        fbLimit(limit),
      ),
    )
    return snap.docs.map(toTransaction)
  }

  async findRecent(userId: string, limit: number): Promise<Transaction[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('date', 'desc'), fbLimit(limit)))
    return snap.docs.map(toTransaction)
  }

  async create(userId: string, data: CreateTransactionDTO): Promise<Transaction> {
    const ref = newDoc(userId, NAME)
    await setDoc(ref, {
      ...toWriteModel(data),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const now = Timestamp.now()
    return {
      id: ref.id,
      ...toWriteModel(data),
      tags: data.tags ?? [],
      isRecurring: data.isRecurring ?? false,
      createdAt: now,
      updatedAt: now,
    } as Transaction
  }

  async update(userId: string, id: string, data: UpdateTransactionDTO): Promise<void> {
    const patch: Record<string, unknown> = stripUndefined({
      ...data,
      date: data.date ? Timestamp.fromDate(data.date) : undefined,
      amount: data.amount !== undefined ? Math.abs(data.amount) : undefined,
    })
    await updateDoc(colDoc(userId, NAME, id), { ...patch, updatedAt: serverTimestamp() })
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async bulkCreate(userId: string, data: CreateTransactionDTO[]): Promise<void> {
    for (let i = 0; i < data.length; i += BATCH_LIMIT) {
      const batch = writeBatch(getDb())
      for (const item of data.slice(i, i + BATCH_LIMIT)) {
        batch.set(newDoc(userId, NAME), {
          ...toWriteModel(item),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
    }
  }

  async bulkDelete(userId: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
      const batch = writeBatch(getDb())
      for (const id of ids.slice(i, i + BATCH_LIMIT)) {
        batch.delete(colDoc(userId, NAME, id))
      }
      await batch.commit()
    }
  }

  async moveCategory(
    userId: string,
    fromCategoryId: string,
    toCategoryId: string,
    toPillar: Pillar,
  ): Promise<number> {
    const snap = await getDocs(query(col(userId, NAME), where('categoryId', '==', fromCategoryId)))
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(getDb())
      for (const d of docs.slice(i, i + BATCH_LIMIT)) {
        batch.update(d.ref, {
          categoryId: toCategoryId,
          pillar: toPillar,
          // The old sub-item belongs to the old category and no longer resolves.
          categoryItemId: deleteField(),
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
    }
    return docs.length
  }

  subscribeToMonth(
    userId: string,
    year: number,
    month: number,
    callback: (txs: Transaction[]) => void,
  ): Unsubscribe {
    const [from, to] = monthBounds(year, month)
    return onSnapshot(
      query(
        col(userId, NAME),
        where('date', '>=', from),
        where('date', '<', to),
        orderBy('date', 'desc'),
      ),
      (snap) => callback(snap.docs.map(toTransaction)),
      (error) => console.warn('Transaction listener error:', error),
    )
  }
}
