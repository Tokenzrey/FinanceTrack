import {
  Timestamp,
  deleteField,
  documentId,
  getDoc,
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
import type { IBudgetRepository } from '../interfaces'
import type { MonthlyBudget } from '@/shared/types/domain'
import { DEFAULT_PILLAR_CONFIG } from '@/shared/types/domain'
import type { UpsertBudgetDTO } from '@/shared/types/dto'
import { yearMonthId } from '@/shared/lib/format'
import { COLLECTIONS, col, colDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.budgets

function toBudget(snap: DocumentSnapshot): MonthlyBudget {
  const data = snap.data()!
  return {
    id: snap.id,
    year: data.year,
    month: data.month,
    totalIncome: data.totalIncome ?? 0,
    pillarConfig: data.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    categoryOverrides: data.categoryOverrides ?? [],
    notes: data.notes,
    closedAt: data.closedAt,
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

export class FirestoreBudgetRepository implements IBudgetRepository {
  async find(userId: string, year: number, month: number): Promise<MonthlyBudget | null> {
    const snap = await getDoc(colDoc(userId, NAME, yearMonthId(year, month)))
    return snap.exists() ? toBudget(snap) : null
  }

  async findRange(
    userId: string,
    fromYearMonth: string,
    toYearMonth: string,
  ): Promise<MonthlyBudget[]> {
    // Document ids are "YYYY-MM", so lexical ordering equals chronological ordering.
    const snap = await getDocs(
      query(
        col(userId, NAME),
        where(documentId(), '>=', fromYearMonth),
        where(documentId(), '<=', toYearMonth),
        orderBy(documentId()),
      ),
    )
    return snap.docs.map(toBudget)
  }

  async upsert(userId: string, data: UpsertBudgetDTO): Promise<MonthlyBudget> {
    const id = yearMonthId(data.year, data.month)
    const ref = colDoc(userId, NAME, id)
    const existing = await getDoc(ref)

    const payload = stripUndefined({
      year: data.year,
      month: data.month,
      totalIncome: data.totalIncome,
      pillarConfig: data.pillarConfig,
      categoryOverrides: data.categoryOverrides,
      notes: data.notes,
    })

    await setDoc(
      ref,
      {
        ...payload,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    const saved = await getDoc(ref)
    return toBudget(saved)
  }

  async closeMonth(userId: string, year: number, month: number): Promise<void> {
    await updateDoc(colDoc(userId, NAME, yearMonthId(year, month)), {
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async reopenMonth(userId: string, year: number, month: number): Promise<void> {
    await updateDoc(colDoc(userId, NAME, yearMonthId(year, month)), {
      closedAt: deleteField(),
      updatedAt: serverTimestamp(),
    })
  }

  subscribe(
    userId: string,
    year: number,
    month: number,
    callback: (budget: MonthlyBudget | null) => void,
  ): Unsubscribe {
    return onSnapshot(
      colDoc(userId, NAME, yearMonthId(year, month)),
      (snap) => callback(snap.exists() ? toBudget(snap) : null),
      (error) => console.warn('Budget listener error:', error),
    )
  }
}
