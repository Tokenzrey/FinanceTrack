import {
  Timestamp,
  getDocs,
  increment,
  query,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import type { IDataResetRepository } from '../interfaces'
import type { ResetSummary } from '@/shared/types/domain'
import { yearMonthId } from '@/shared/lib/format'
import { COLLECTIONS, col, colDoc } from './paths'

const BATCH_LIMIT = 500

async function deleteAllDocs(userId: string, name: string): Promise<number> {
  const snap = await getDocs(col(userId, name))
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(getDb())
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.docs.length
}

async function deleteDateRange(
  userId: string,
  name: string,
  field: string,
  from: Date,
  to: Date,
): Promise<QueryDocumentSnapshot[]> {
  const snap = await getDocs(
    query(
      col(userId, name),
      where(field, '>=', Timestamp.fromDate(from)),
      where(field, '<', Timestamp.fromDate(to)),
    ),
  )
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(getDb())
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.docs
}

/**
 * Financial-data-only wipe, spanning collections the same way
 * `FirestoreSavingsGoalRepository.delete` already spans goal + contributions — this is
 * that pattern scaled to the whole account.
 */
export class FirestoreDataResetRepository implements IDataResetRepository {
  async resetAll(userId: string): Promise<ResetSummary> {
    const [transactionsDeleted, goalContributionsDeleted, ...rest] = await Promise.all([
      deleteAllDocs(userId, COLLECTIONS.transactions),
      deleteAllDocs(userId, COLLECTIONS.goalContributions),
      deleteAllDocs(userId, COLLECTIONS.budgets),
      deleteAllDocs(userId, COLLECTIONS.goals),
      deleteAllDocs(userId, COLLECTIONS.netWorth),
      deleteAllDocs(userId, COLLECTIONS.assets),
      deleteAllDocs(userId, COLLECTIONS.liabilities),
      deleteAllDocs(userId, COLLECTIONS.recurring),
      deleteAllDocs(userId, COLLECTIONS.receiptScans),
      deleteAllDocs(userId, COLLECTIONS.wishlist),
    ])

    return {
      transactionsDeleted,
      goalContributionsDeleted,
      otherDeleted: rest.reduce((sum, n) => sum + n, 0),
    }
  }

  async resetMonth(userId: string, year: number, month: number): Promise<ResetSummary> {
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)
    const ym = yearMonthId(year, month)

    const [txDocs, contribDocs, goalsSnap] = await Promise.all([
      deleteDateRange(userId, COLLECTIONS.transactions, 'date', from, to),
      deleteDateRange(userId, COLLECTIONS.goalContributions, 'date', from, to),
      getDocs(col(userId, COLLECTIONS.goals)),
    ])
    const existingGoalIds = new Set(goalsSnap.docs.map((d) => d.id))

    // Contributions carry their running total on the goal doc (`currentAmount`) —
    // deleting the rows without unwinding the total would leave every goal overstated.
    // (A wishlist item purchased within this same month keeps its now-dangling
    // `transactionId` — a narrow, rare overlap left as a known gap rather than adding
    // a full wishlist-unwind pass for it.)
    const byGoal = new Map<string, number>()
    for (const d of contribDocs) {
      const data = d.data()
      byGoal.set(data.goalId, (byGoal.get(data.goalId) ?? 0) + (data.amount ?? 0))
    }
    if (byGoal.size > 0) {
      const batch = writeBatch(getDb())
      for (const [goalId, amount] of byGoal) {
        // `update` throws if the doc is gone (an orphaned contribution, e.g. from a
        // goal deleted outside its normal cascade-delete path) — one missing goal
        // would otherwise abort this whole batch, including every other goal in it.
        if (!existingGoalIds.has(goalId)) continue
        batch.update(colDoc(userId, COLLECTIONS.goals, goalId), {
          currentAmount: increment(-amount),
        })
      }
      await batch.commit()
    }

    const scanDocs = await deleteDateRange(userId, COLLECTIONS.receiptScans, 'createdAt', from, to)

    // Both doc ids equal the yearMonth string — deleting a doc that never existed is a
    // harmless no-op in Firestore.
    const cleanupBatch = writeBatch(getDb())
    cleanupBatch.delete(colDoc(userId, COLLECTIONS.budgets, ym))
    cleanupBatch.delete(colDoc(userId, COLLECTIONS.netWorth, ym))
    await cleanupBatch.commit()

    return {
      transactionsDeleted: txDocs.length,
      goalContributionsDeleted: contribDocs.length,
      otherDeleted: scanDocs.length,
    }
  }
}
