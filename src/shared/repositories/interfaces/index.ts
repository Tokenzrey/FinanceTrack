import type { Unsubscribe } from 'firebase/firestore'
import type {
  AppSettings,
  Asset,
  BudgetTemplate,
  Category,
  CategoryItem,
  GoalContribution,
  Liability,
  MonthlyBudget,
  NetWorthSnapshot,
  Pillar,
  RecurringRule,
  ResetSummary,
  SavingsGoal,
  Transaction,
  UserProfile,
} from '@/shared/types/domain'
import type {
  AssetDTO,
  CreateCategoryDTO,
  CreateCategoryItemDTO,
  CreateGoalDTO,
  CreateRecurringRuleDTO,
  CreateTransactionDTO,
  LiabilityDTO,
  UpdateCategoryDTO,
  UpdateCategoryItemDTO,
  UpdateGoalDTO,
  UpdateRecurringRuleDTO,
  UpdateTransactionDTO,
  UpsertBudgetDTO,
} from '@/shared/types/dto'

export interface ITransactionRepository {
  findById(userId: string, id: string): Promise<Transaction | null>
  findByMonth(userId: string, year: number, month: number): Promise<Transaction[]>
  findByDateRange(userId: string, from: Date, to: Date): Promise<Transaction[]>
  findByCategory(userId: string, categoryId: string, limit?: number): Promise<Transaction[]>
  findRecent(userId: string, limit: number): Promise<Transaction[]>
  create(userId: string, data: CreateTransactionDTO): Promise<Transaction>
  update(userId: string, id: string, data: UpdateTransactionDTO): Promise<void>
  delete(userId: string, id: string): Promise<void>
  bulkCreate(userId: string, data: CreateTransactionDTO[]): Promise<void>
  bulkDelete(userId: string, ids: string[]): Promise<void>
  /**
   * Reassigns every transaction of one category to another — used by category delete.
   * `toPillar` moves with the category; leaving the old pillar would skew every pillar chart.
   */
  moveCategory(
    userId: string,
    fromCategoryId: string,
    toCategoryId: string,
    toPillar: Pillar,
  ): Promise<number>
  subscribeToMonth(
    userId: string,
    year: number,
    month: number,
    callback: (txs: Transaction[]) => void,
  ): Unsubscribe
}

export interface ICategoryRepository {
  findAll(userId: string): Promise<Category[]>
  findById(userId: string, id: string): Promise<Category | null>
  create(userId: string, data: CreateCategoryDTO): Promise<Category>
  update(userId: string, id: string, data: UpdateCategoryDTO): Promise<void>
  /** Soft delete — keeps history intact by setting isActive:false. */
  softDelete(userId: string, id: string): Promise<void>
  reorder(userId: string, pillar: Pillar, orderedIds: string[]): Promise<void>
  subscribe(userId: string, callback: (categories: Category[]) => void): Unsubscribe

  findItems(userId: string, categoryId: string): Promise<CategoryItem[]>
  findAllItems(userId: string): Promise<CategoryItem[]>
  createItem(userId: string, data: CreateCategoryItemDTO): Promise<CategoryItem>
  updateItem(userId: string, id: string, data: UpdateCategoryItemDTO): Promise<void>
  deleteItem(userId: string, id: string): Promise<void>
}

export interface IBudgetRepository {
  find(userId: string, year: number, month: number): Promise<MonthlyBudget | null>
  findRange(userId: string, fromYearMonth: string, toYearMonth: string): Promise<MonthlyBudget[]>
  upsert(userId: string, data: UpsertBudgetDTO): Promise<MonthlyBudget>
  closeMonth(userId: string, year: number, month: number): Promise<void>
  /** Undoes closeMonth — "Tutup Bulan" is a one-click lock, not a one-way trap. */
  reopenMonth(userId: string, year: number, month: number): Promise<void>
  subscribe(
    userId: string,
    year: number,
    month: number,
    callback: (budget: MonthlyBudget | null) => void,
  ): Unsubscribe
}

export interface ISavingsGoalRepository {
  findAll(userId: string): Promise<SavingsGoal[]>
  findById(userId: string, id: string): Promise<SavingsGoal | null>
  create(userId: string, data: CreateGoalDTO): Promise<SavingsGoal>
  update(userId: string, id: string, data: UpdateGoalDTO): Promise<void>
  delete(userId: string, id: string): Promise<void>
  addContribution(userId: string, goalId: string, amount: number, note?: string): Promise<void>
  findContributions(userId: string, goalId: string): Promise<GoalContribution[]>
}

export interface INetWorthRepository {
  findSnapshots(userId: string, limit?: number): Promise<NetWorthSnapshot[]>
  findSnapshot(userId: string, yearMonth: string): Promise<NetWorthSnapshot | null>
  saveSnapshot(
    userId: string,
    yearMonth: string,
    assets: AssetDTO[],
    liabilities: LiabilityDTO[],
  ): Promise<NetWorthSnapshot>
  findAssets(userId: string): Promise<Asset[]>
  upsertAsset(userId: string, data: AssetDTO): Promise<Asset>
  deleteAsset(userId: string, id: string): Promise<void>
  findLiabilities(userId: string): Promise<Liability[]>
  upsertLiability(userId: string, data: LiabilityDTO): Promise<Liability>
  deleteLiability(userId: string, id: string): Promise<void>
}

export interface IRecurringRuleRepository {
  findAll(userId: string): Promise<RecurringRule[]>
  findActive(userId: string): Promise<RecurringRule[]>
  create(userId: string, data: CreateRecurringRuleDTO): Promise<RecurringRule>
  update(userId: string, id: string, data: UpdateRecurringRuleDTO): Promise<void>
  delete(userId: string, id: string): Promise<void>
  markGenerated(userId: string, id: string, at: Date): Promise<void>
  /** Records a one-off skip for a single due date, leaving the rule active. */
  skipOccurrence(userId: string, id: string, dayKey: string): Promise<void>
}

export interface IBudgetTemplateRepository {
  findAll(userId: string): Promise<BudgetTemplate[]>
  create(userId: string, data: Omit<BudgetTemplate, 'id' | 'createdAt'>): Promise<BudgetTemplate>
  update(userId: string, id: string, data: Partial<BudgetTemplate>): Promise<void>
  delete(userId: string, id: string): Promise<void>
}

export interface IDataResetRepository {
  /**
   * Wipes every financial record for this account. Categories, category items, budget
   * templates (master data) and everything under `meta/*` — profile, settings, the
   * Drive link (account) — are never named by this method, so they are structurally
   * impossible for it to touch.
   */
  resetAll(userId: string): Promise<ResetSummary>
  /**
   * Wipes one month's transactions, that month's budget/income entry, goal
   * contributions dated that month (goal totals adjusted to match), the net-worth
   * snapshot for that month, and receipt scans from that month. Goals, recurring
   * rules, assets/liabilities and wishlist are month-agnostic and left untouched.
   */
  resetMonth(userId: string, year: number, month: number): Promise<ResetSummary>
}

export interface IUserRepository {
  findProfile(userId: string): Promise<UserProfile | null>
  createProfile(userId: string, data: Omit<UserProfile, 'createdAt'>): Promise<UserProfile>
  updateProfile(userId: string, data: Partial<UserProfile>): Promise<void>
  findSettings(userId: string): Promise<AppSettings | null>
  saveSettings(userId: string, settings: Partial<AppSettings>): Promise<void>
}
