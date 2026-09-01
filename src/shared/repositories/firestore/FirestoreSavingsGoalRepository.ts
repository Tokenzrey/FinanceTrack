import {
  Timestamp,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import type { ISavingsGoalRepository } from '../interfaces'
import type { GoalContribution, SavingsGoal } from '@/shared/types/domain'
import type { CreateGoalDTO, UpdateGoalDTO } from '@/shared/types/dto'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.goals
const CONTRIB = COLLECTIONS.goalContributions

function toGoal(snap: DocumentSnapshot): SavingsGoal {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    categoryId: data.categoryId,
    targetAmount: data.targetAmount ?? 0,
    currentAmount: data.currentAmount ?? 0,
    targetDate: data.targetDate,
    monthlyContribution: data.monthlyContribution ?? 0,
    priority: data.priority ?? 'medium',
    emoji: data.emoji,
    isAchieved: data.isAchieved ?? false,
    achievedAt: data.achievedAt,
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreSavingsGoalRepository implements ISavingsGoalRepository {
  async findAll(userId: string): Promise<SavingsGoal[]> {
    const snap = await getDocs(col(userId, NAME))
    return snap.docs.map(toGoal)
  }

  async findById(userId: string, id: string): Promise<SavingsGoal | null> {
    const snap = await getDoc(colDoc(userId, NAME, id))
    return snap.exists() ? toGoal(snap) : null
  }

  async create(userId: string, data: CreateGoalDTO): Promise<SavingsGoal> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      name: data.name,
      categoryId: data.categoryId,
      targetAmount: data.targetAmount,
      currentAmount: data.currentAmount ?? 0,
      targetDate: data.targetDate ? Timestamp.fromDate(data.targetDate) : undefined,
      monthlyContribution: data.monthlyContribution,
      priority: data.priority,
      emoji: data.emoji,
      isAchieved: false,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
    return { id: ref.id, ...payload, createdAt: Timestamp.now() } as SavingsGoal
  }

  async update(userId: string, id: string, data: UpdateGoalDTO): Promise<void> {
    const patch = stripUndefined({
      ...data,
      targetDate: data.targetDate ? Timestamp.fromDate(data.targetDate) : undefined,
      achievedAt: data.isAchieved ? serverTimestamp() : undefined,
    })
    await updateDoc(colDoc(userId, NAME, id), patch)
  }

  async delete(userId: string, id: string): Promise<void> {
    const contributions = await getDocs(query(col(userId, CONTRIB), where('goalId', '==', id)))
    const batch = writeBatch(getDb())
    contributions.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(colDoc(userId, NAME, id))
    await batch.commit()
  }

  /** Contribution row + running total move together so the goal card never drifts. */
  async addContribution(
    userId: string,
    goalId: string,
    amount: number,
    note?: string,
  ): Promise<void> {
    const batch = writeBatch(getDb())
    batch.set(
      newDoc(userId, CONTRIB),
      stripUndefined({ goalId, amount, note, date: serverTimestamp() }),
    )
    batch.update(colDoc(userId, NAME, goalId), { currentAmount: increment(amount) })
    await batch.commit()
  }

  async findContributions(userId: string, goalId: string): Promise<GoalContribution[]> {
    const snap = await getDocs(
      query(col(userId, CONTRIB), where('goalId', '==', goalId), orderBy('date', 'desc')),
    )
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        goalId: data.goalId,
        amount: data.amount,
        date: data.date ?? Timestamp.now(),
        note: data.note,
      }
    })
  }
}
