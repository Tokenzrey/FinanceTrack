import { FirestoreBudgetRepository } from './firestore/FirestoreBudgetRepository'
import { FirestoreBudgetTemplateRepository } from './firestore/FirestoreBudgetTemplateRepository'
import { FirestoreCategoryRepository } from './firestore/FirestoreCategoryRepository'
import { FirestoreDataResetRepository } from './firestore/FirestoreDataResetRepository'
import { FirestoreNetWorthRepository } from './firestore/FirestoreNetWorthRepository'
import { FirestoreNoteRepository } from './firestore/FirestoreNoteRepository'
import { FirestoreReceiptScanRepository } from './firestore/FirestoreReceiptScanRepository'
import { FirestoreReminderRepository } from './firestore/FirestoreReminderRepository'
import { FirestoreRecurringRuleRepository } from './firestore/FirestoreRecurringRuleRepository'
import { FirestoreSavingsGoalRepository } from './firestore/FirestoreSavingsGoalRepository'
import { FirestoreTaskRepository } from './firestore/FirestoreTaskRepository'
import { FirestoreTransactionRepository } from './firestore/FirestoreTransactionRepository'
import { FirestoreUserRepository } from './firestore/FirestoreUserRepository'
import { FirestoreWishlistRepository } from './firestore/FirestoreWishlistRepository'

export * from './interfaces'

/**
 * Single composition root. Use cases import from here, never from `./firestore/*`,
 * so swapping the backend means editing this file only.
 */
export const repositories = {
  transactions: new FirestoreTransactionRepository(),
  categories: new FirestoreCategoryRepository(),
  budgets: new FirestoreBudgetRepository(),
  dataReset: new FirestoreDataResetRepository(),
  goals: new FirestoreSavingsGoalRepository(),
  netWorth: new FirestoreNetWorthRepository(),
  recurring: new FirestoreRecurringRuleRepository(),
  receiptScans: new FirestoreReceiptScanRepository(),
  templates: new FirestoreBudgetTemplateRepository(),
  users: new FirestoreUserRepository(),
  wishlist: new FirestoreWishlistRepository(),
  tasks: new FirestoreTaskRepository(),
  notes: new FirestoreNoteRepository(),
  reminders: new FirestoreReminderRepository(),
} as const

export type Repositories = typeof repositories
