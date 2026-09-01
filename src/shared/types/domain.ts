import type { Timestamp } from 'firebase/firestore'

// ─── Master Data ────────────────────────────────────────────────

export type Pillar = 'income' | 'needs' | 'wants' | 'savings'

export const PILLARS: Pillar[] = ['income', 'needs', 'wants', 'savings']

/** Pillars that consume the monthly income. `income` is the source, not a spend bucket. */
export const SPEND_PILLARS = ['needs', 'wants', 'savings'] as const
export type SpendPillar = (typeof SPEND_PILLARS)[number]

export const PILLAR_LABELS: Record<Pillar, string> = {
  income: 'Pemasukan',
  needs: 'Kebutuhan',
  wants: 'Keinginan',
  savings: 'Tabungan',
}

export type CategoryIcon =
  | 'home'
  | 'zap'
  | 'shopping-cart'
  | 'car'
  | 'heart'
  | 'coffee'
  | 'gamepad'
  | 'book'
  | 'trending-up'
  | 'shield'
  | 'globe'
  | 'music'
  | 'camera'
  | 'dumbbell'
  | 'gift'
  | 'laptop'
  | 'plane'
  | 'utensils'
  | 'dollar-sign'
  | 'star'

export interface Category {
  id: string
  name: string
  pillar: Pillar
  percentOfIncome: number
  color: string
  icon: CategoryIcon
  isSinkingFund: boolean
  sinkingFundTargetMonths?: number
  isRecurring: boolean
  isActive: boolean
  order: number
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface CategoryItem {
  id: string
  categoryId: string
  name: string
  description?: string
  isRecurring: boolean
  recurringAmount?: number
  recurringDay?: number
  isActive: boolean
  createdAt: Timestamp
}

// ─── Transactions ────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense' | 'transfer'

export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'transfer' | 'ewallet' | 'qris'

export type SpendingMood = 'regret' | 'neutral' | 'happy'

export interface Transaction {
  id: string
  date: Timestamp
  type: TransactionType
  pillar: Pillar
  categoryId: string
  categoryItemId?: string
  amount: number
  description?: string
  tags: string[]
  paymentMethod?: PaymentMethod
  /**
   * @deprecated Firebase Storage URL from before the Google Drive migration.
   * Kept read-only so receipts attached under the old scheme still open; new uploads
   * write the gDrive* fields instead. Removing it outright would orphan those images.
   */
  receiptUrl?: string
  /** @deprecated See {@link Transaction.receiptUrl}. */
  receiptThumbnailUrl?: string
  /** Google Drive file id — the receipt lives in the user's own Drive. */
  gDriveFileId?: string
  gDriveWebViewLink?: string
  gDriveThumbnailLink?: string
  isRecurring: boolean
  recurringRuleId?: string
  location?: string
  mood?: SpendingMood
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Budget ─────────────────────────────────────────────────────

export interface PillarConfig {
  needs: number
  wants: number
  savings: number
}

export const DEFAULT_PILLAR_CONFIG: PillarConfig = { needs: 0.5, wants: 0.3, savings: 0.2 }

export interface CategoryBudgetOverride {
  categoryId: string
  percentOverride?: number
  fixedBudget?: number
}

export interface MonthlyBudget {
  id: string
  year: number
  month: number
  totalIncome: number
  pillarConfig: PillarConfig
  categoryOverrides: CategoryBudgetOverride[]
  notes?: string
  closedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Savings Goals ───────────────────────────────────────────────

export interface SavingsGoal {
  id: string
  name: string
  categoryId: string
  targetAmount: number
  currentAmount: number
  targetDate?: Timestamp
  monthlyContribution: number
  priority: 'low' | 'medium' | 'high'
  emoji?: string
  isAchieved: boolean
  achievedAt?: Timestamp
  createdAt: Timestamp
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: number
  date: Timestamp
  note?: string
}

// ─── Net Worth ───────────────────────────────────────────────────

export type AssetType = 'cash' | 'savings' | 'investment' | 'property' | 'vehicle' | 'other'
export type LiabilityType = 'credit_card' | 'kpr' | 'kta' | 'vehicle_loan' | 'other'

export interface Asset {
  id: string
  name: string
  type: AssetType
  value: number
  institution?: string
  notes?: string
  updatedAt: Timestamp
}

export interface Liability {
  id: string
  name: string
  type: LiabilityType
  totalAmount: number
  remainingAmount: number
  monthlyPayment: number
  interestRate?: number
  dueDate?: Timestamp
  institution?: string
  updatedAt: Timestamp
}

export interface NetWorthSnapshot {
  id: string
  yearMonth: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  assets: Asset[]
  liabilities: Liability[]
  createdAt: Timestamp
}

// ─── Recurring Rules ─────────────────────────────────────────────

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringRule {
  id: string
  name: string
  type: TransactionType
  categoryId: string
  categoryItemId?: string
  amount: number
  frequency: RecurringFrequency
  dayOfMonth?: number
  dayOfWeek?: number
  startDate: Timestamp
  endDate?: Timestamp
  isActive: boolean
  lastGeneratedAt?: Timestamp
  /** Local day keys (yyyy-MM-dd) the user chose to skip once. */
  skippedDates?: string[]
  paymentMethod?: PaymentMethod
  notes?: string
  createdAt: Timestamp
}

// ─── Analytics Derived ───────────────────────────────────────────

export type BudgetStatus = 'safe' | 'warning' | 'danger' | 'exceeded'

export interface CategorySummary {
  category: Category
  budget: number
  used: number
  remaining: number
  absorptionRate: number
  dailyBurnRate: number
  projectedMonthEnd: number
  daysLeft: number
  dailyAllowanceLeft: number
  status: BudgetStatus
  trend: 'up' | 'down' | 'stable'
  vsLastMonth: number
}

export interface MonthlySummary {
  year: number
  month: number
  totalIncome: number
  totalBudget: number
  totalUsed: number
  totalSaved: number
  netCashFlow: number
  savingsRate: number
  dailyAvgSpend: number
  topSpendingCategory: string
  categories: CategorySummary[]
  pillarSummary: Record<Pillar, { budget: number; used: number }>
}

// ─── Budget Template ─────────────────────────────────────────────

export interface BudgetTemplate {
  id: string
  name: string
  description?: string
  pillarConfig: PillarConfig
  categoryAllocations: { categoryId: string; percent: number }[]
  isDefault: boolean
  createdAt: Timestamp
}

// ─── User Profile & Settings ─────────────────────────────────────

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  photoURL?: string
  currency: 'IDR'
  locale: 'id-ID'
  timezone: string
  onboardingCompleted: boolean
  createdAt: Timestamp
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  density: 'compact' | 'comfortable' | 'spacious'
  defaultPillarConfig: PillarConfig
  weekStartDay: 0 | 1
  notifications: {
    dailyReminder: boolean
    reminderTime: string
    budgetAlert: boolean
    budgetAlertThreshold: number
    weeklyReport: boolean
    savingsGoalMilestone: boolean
  }
  display: {
    showCentsInTable: boolean
    compactKpiCards: boolean
    defaultChartType: 'bar' | 'line' | 'donut'
    showMoodTracker: boolean
    showPaymentMethod: boolean
  }
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  accentColor: '#14B8A6',
  density: 'comfortable',
  defaultPillarConfig: DEFAULT_PILLAR_CONFIG,
  weekStartDay: 1,
  notifications: {
    dailyReminder: false,
    reminderTime: '20:00',
    budgetAlert: true,
    budgetAlertThreshold: 80,
    weeklyReport: false,
    savingsGoalMilestone: true,
  },
  display: {
    showCentsInTable: false,
    compactKpiCards: false,
    defaultChartType: 'bar',
    showMoodTracker: true,
    showPaymentMethod: true,
  },
}

// ─── Data Reset ──────────────────────────────────────────────────

export interface ResetSummary {
  transactionsDeleted: number
  goalContributionsDeleted: number
  /** Everything else touched by the scope — budgets, goals, snapshots, scans, etc. */
  otherDeleted: number
}

export interface AppNotification {
  id: string
  title: string
  body?: string
  level: 'info' | 'success' | 'warning' | 'error'
  createdAt: number
  read: boolean
}
