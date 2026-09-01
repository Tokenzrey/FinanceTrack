import type { Timestamp } from 'firebase/firestore'

export type WishlistStatus = 'idea' | 'saving' | 'ready_to_buy' | 'purchased' | 'cancelled'
export type WishlistPriority = 'low' | 'medium' | 'high'
export type Justification = 'need' | 'want' | 'upgrade' | 'replacement'
export type FinancingMethod = 'cash' | 'savings' | 'credit_card' | 'paylater'

export type AffordabilityDecision = 'Aman Dibeli' | 'Gunakan Tabungan' | 'Tunda (Risiko Tinggi)'

export interface EmergencyFundImpact {
  beforePurchase: number
  afterPurchase: number
  /** Critical once the remaining buffer falls under three months of expenses. */
  status: 'Aman' | 'Kritis'
}

export interface AffordabilityMetrics {
  /** Price as a share of what is left unspent in this month's budget. */
  percentOfRemainingBudget: number
  emergencyFundImpact: EmergencyFundImpact
  /** DTI after adding this purchase's instalment, as a percent of monthly income. */
  postPurchaseDebtRatio: number
  /** What the same money would grow to in five years at the SBN reference rate. */
  opportunityCost5Years: number
}

export interface SmartAffordabilityResult {
  recommendationScore: number
  decision: AffordabilityDecision
  metrics: AffordabilityMetrics
  /** Plain-language lines derived from the metrics — deterministic, not model output. */
  insights: string[]
}

export interface Wishlist {
  id: string
  name: string
  estimatedPrice: number
  url?: string
  priority: WishlistPriority
  status: WishlistStatus

  justification: Justification
  financingMethod: FinancingMethod
  estimatedMonthlyInstallment?: number
  installmentTenureMonths?: number
  coolingOffEndDate?: Timestamp

  /** Computed at runtime by the store; never persisted. */
  affordabilityAnalytics?: SmartAffordabilityResult

  actualPrice?: number
  transactionId?: string
  purchasedAt?: Timestamp

  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface CreateWishlistDTO {
  name: string
  estimatedPrice: number
  url?: string
  priority: WishlistPriority
  justification: Justification
  financingMethod: FinancingMethod
  estimatedMonthlyInstallment?: number
  installmentTenureMonths?: number
  /** Days to wait before buying. Zero skips the cooling-off period. */
  coolingOffDays?: number
}

export type UpdateWishlistDTO = Partial<CreateWishlistDTO> & { status?: WishlistStatus }

export const STATUS_LABELS: Record<WishlistStatus, string> = {
  idea: 'Ide',
  saving: 'Menabung',
  ready_to_buy: 'Siap beli',
  purchased: 'Dibeli',
  cancelled: 'Dibatalkan',
}

export const JUSTIFICATION_LABELS: Record<Justification, string> = {
  need: 'Kebutuhan',
  want: 'Keinginan',
  upgrade: 'Upgrade',
  replacement: 'Pengganti',
}

export const FINANCING_LABELS: Record<FinancingMethod, string> = {
  cash: 'Tunai',
  savings: 'Ambil dari tabungan',
  credit_card: 'Kartu kredit',
  paylater: 'Paylater',
}
