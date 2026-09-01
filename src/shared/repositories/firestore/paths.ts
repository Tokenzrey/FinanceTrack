import { collection, doc, type DocumentData, type Timestamp } from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'

/**
 * Every collection lives under `users/{userId}` so the single Firestore rule
 * (`request.auth.uid == userId`) covers the whole tree.
 */
export const userDoc = (userId: string) => doc(getDb(), 'users', userId)

export const col = (userId: string, name: string) => collection(getDb(), 'users', userId, name)

export const colDoc = (userId: string, name: string, id: string) =>
  doc(getDb(), 'users', userId, name, id)

/** New document reference with a client-generated id, so callers know the id before the write. */
export const newDoc = (userId: string, name: string) => doc(col(userId, name))

export const COLLECTIONS = {
  transactions: 'transactions',
  categories: 'categories',
  categoryItems: 'category_items',
  budgets: 'monthly_budgets',
  goals: 'savings_goals',
  goalContributions: 'goal_contributions',
  netWorth: 'net_worth_snapshots',
  assets: 'assets',
  liabilities: 'liabilities',
  recurring: 'recurring_rules',
  templates: 'budget_templates',
  receiptScans: 'receipt_scans',
  wishlist: 'wishlist',
  notifications: 'notifications',
  meta: 'meta',
} as const

/** Firestore rejects `undefined`; optional DTO fields must be dropped, not sent as undefined. */
export function stripUndefined<T extends DocumentData>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T
}

export type WithTimestamps = { createdAt: Timestamp; updatedAt: Timestamp }
