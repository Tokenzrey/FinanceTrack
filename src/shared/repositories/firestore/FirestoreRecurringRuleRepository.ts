import {
  Timestamp,
  arrayUnion,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore'
import type { IRecurringRuleRepository } from '../interfaces'
import type { RecurringRule } from '@/shared/types/domain'
import type { CreateRecurringRuleDTO, UpdateRecurringRuleDTO } from '@/shared/types/dto'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.recurring

function toRule(snap: DocumentSnapshot): RecurringRule {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    type: data.type,
    categoryId: data.categoryId,
    categoryItemId: data.categoryItemId,
    amount: data.amount ?? 0,
    frequency: data.frequency,
    dayOfMonth: data.dayOfMonth,
    dayOfWeek: data.dayOfWeek,
    startDate: data.startDate ?? Timestamp.now(),
    endDate: data.endDate,
    isActive: data.isActive ?? true,
    lastGeneratedAt: data.lastGeneratedAt,
    skippedDates: data.skippedDates ?? [],
    paymentMethod: data.paymentMethod,
    notes: data.notes,
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreRecurringRuleRepository implements IRecurringRuleRepository {
  async findAll(userId: string): Promise<RecurringRule[]> {
    const snap = await getDocs(col(userId, NAME))
    return snap.docs.map(toRule)
  }

  async findActive(userId: string): Promise<RecurringRule[]> {
    const snap = await getDocs(query(col(userId, NAME), where('isActive', '==', true)))
    return snap.docs.map(toRule)
  }

  async create(userId: string, data: CreateRecurringRuleDTO): Promise<RecurringRule> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      name: data.name,
      type: data.type,
      categoryId: data.categoryId,
      categoryItemId: data.categoryItemId,
      amount: data.amount,
      frequency: data.frequency,
      dayOfMonth: data.dayOfMonth,
      dayOfWeek: data.dayOfWeek,
      startDate: Timestamp.fromDate(data.startDate),
      endDate: data.endDate ? Timestamp.fromDate(data.endDate) : undefined,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      isActive: true,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
    return { id: ref.id, ...payload, createdAt: Timestamp.now() } as RecurringRule
  }

  async update(userId: string, id: string, data: UpdateRecurringRuleDTO): Promise<void> {
    const patch = stripUndefined({
      ...data,
      startDate: data.startDate ? Timestamp.fromDate(data.startDate) : undefined,
      endDate: data.endDate ? Timestamp.fromDate(data.endDate) : undefined,
    })
    await updateDoc(colDoc(userId, NAME, id), patch)
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }

  async markGenerated(userId: string, id: string, at: Date): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), { lastGeneratedAt: Timestamp.fromDate(at) })
  }

  async skipOccurrence(userId: string, id: string, dayKey: string): Promise<void> {
    // arrayUnion so two tabs skipping at once cannot clobber each other's entry.
    await updateDoc(colDoc(userId, NAME, id), { skippedDates: arrayUnion(dayKey) })
  }
}
