import type {
  AssetType,
  CategoryIcon,
  LiabilityType,
  PaymentMethod,
  Pillar,
  PillarConfig,
  RecurringFrequency,
  SpendingMood,
  TransactionType,
} from './domain'

// Write-side shapes. Firestore-managed fields (id, createdAt, updatedAt) are never sent by callers.

export interface CreateTransactionDTO {
  date: Date
  type: TransactionType
  pillar: Pillar
  categoryId: string
  categoryItemId?: string
  amount: number
  description?: string
  tags?: string[]
  paymentMethod?: PaymentMethod
  /** @deprecated Legacy Firebase Storage URL; new uploads use the gDrive fields. */
  receiptUrl?: string
  /** @deprecated See {@link CreateTransactionDTO.receiptUrl}. */
  receiptThumbnailUrl?: string
  gDriveFileId?: string
  gDriveWebViewLink?: string
  gDriveThumbnailLink?: string
  isRecurring?: boolean
  recurringRuleId?: string
  location?: string
  mood?: SpendingMood
}

export type UpdateTransactionDTO = Partial<CreateTransactionDTO>

export interface CreateCategoryDTO {
  name: string
  pillar: Pillar
  percentOfIncome: number
  color: string
  icon: CategoryIcon
  isSinkingFund?: boolean
  sinkingFundTargetMonths?: number
  isRecurring?: boolean
  order?: number
  notes?: string
}

export type UpdateCategoryDTO = Partial<CreateCategoryDTO> & { isActive?: boolean }

export interface CreateCategoryItemDTO {
  categoryId: string
  name: string
  description?: string
  isRecurring?: boolean
  recurringAmount?: number
  recurringDay?: number
}

export type UpdateCategoryItemDTO = Partial<CreateCategoryItemDTO> & { isActive?: boolean }

export interface UpsertBudgetDTO {
  year: number
  month: number
  totalIncome?: number
  pillarConfig?: PillarConfig
  categoryOverrides?: { categoryId: string; percentOverride?: number; fixedBudget?: number }[]
  notes?: string
}

export interface CreateGoalDTO {
  name: string
  categoryId: string
  targetAmount: number
  currentAmount?: number
  targetDate?: Date
  monthlyContribution: number
  priority: 'low' | 'medium' | 'high'
  emoji?: string
}

export type UpdateGoalDTO = Partial<CreateGoalDTO> & { isAchieved?: boolean }

export interface CreateRecurringRuleDTO {
  name: string
  type: TransactionType
  categoryId: string
  categoryItemId?: string
  amount: number
  frequency: RecurringFrequency
  dayOfMonth?: number
  dayOfWeek?: number
  startDate: Date
  endDate?: Date
  paymentMethod?: PaymentMethod
  notes?: string
}

export type UpdateRecurringRuleDTO = Partial<CreateRecurringRuleDTO> & { isActive?: boolean }

export interface AssetDTO {
  id?: string
  name: string
  type: AssetType
  value: number
  institution?: string
  notes?: string
}

export interface LiabilityDTO {
  id?: string
  name: string
  type: LiabilityType
  totalAmount: number
  remainingAmount: number
  monthlyPayment: number
  interestRate?: number
  dueDate?: Date
  institution?: string
}
