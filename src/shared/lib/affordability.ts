import { formatIDR, formatPercent } from './format'
import type {
  AffordabilityDecision,
  FinancingMethod,
  SmartAffordabilityResult,
  Wishlist,
} from '@/shared/types/wishlist.types'

/**
 * Automated affordability engine.
 *
 * Turns a purchase plan plus the user's real financial position into one recommendation,
 * so they do not have to do the arithmetic themselves. Every number here is derived and
 * shown; nothing is a black box, and no model is involved — the "insights" are
 * deterministic sentences generated from the metrics.
 */

/** Reference yield used for opportunity cost — roughly Indonesian retail SBN. */
export const SBN_ANNUAL_RATE = 0.06
export const OPPORTUNITY_YEARS = 5

/** Conventional thresholds. DTI above 30% is widely treated as over-leveraged. */
export const DTI_DANGER = 30
export const EMERGENCY_MONTHS = 3

export interface AffordabilityInput {
  price: number
  financingMethod: FinancingMethod
  /** Monthly instalment, when financing by credit card or paylater. */
  monthlyInstallment?: number
  /** Liquid savings available today (cash + savings accounts). */
  liquidAssets: number
  /** Committed monthly debt payments before this purchase. */
  existingMonthlyDebt: number
  monthlyIncome: number
  /** Typical monthly spending, used for the emergency-fund floor. */
  monthlyExpenses: number
  /** Budget still unspent this month. */
  remainingBudget: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Financing that draws down liquid savings rather than adding debt. */
function drawsDownCash(method: FinancingMethod): boolean {
  return method === 'cash' || method === 'savings'
}

export function calculateAffordability(input: AffordabilityInput): SmartAffordabilityResult {
  const {
    price,
    financingMethod,
    monthlyInstallment = 0,
    liquidAssets,
    existingMonthlyDebt,
    monthlyIncome,
    monthlyExpenses,
    remainingBudget,
  } = input

  // ── Metrics ────────────────────────────────────────────────────

  // A price against a zero or negative remaining budget is 100% consumed, not Infinity.
  const percentOfRemainingBudget =
    remainingBudget > 0 ? (price / remainingBudget) * 100 : price > 0 ? 100 : 0

  const cashPurchase = drawsDownCash(financingMethod)
  const afterPurchase = cashPurchase ? liquidAssets - price : liquidAssets
  const emergencyFloor = monthlyExpenses * EMERGENCY_MONTHS

  const emergencyFundImpact = {
    beforePurchase: liquidAssets,
    afterPurchase,
    status: (afterPurchase < emergencyFloor ? 'Kritis' : 'Aman') as 'Aman' | 'Kritis',
  }

  const newDebt = cashPurchase ? 0 : monthlyInstallment
  const postPurchaseDebtRatio =
    monthlyIncome > 0 ? ((existingMonthlyDebt + newDebt) / monthlyIncome) * 100 : 0

  const opportunityCost5Years = price * (1 + SBN_ANNUAL_RATE) ** OPPORTUNITY_YEARS

  // ── Score ──────────────────────────────────────────────────────
  // Starts at 100 and loses points for each risk the purchase introduces.

  let score = 100

  // 1. Debt load. Past the danger line the penalty is severe, as the plan requires.
  if (!cashPurchase) {
    if (postPurchaseDebtRatio > DTI_DANGER) {
      score -= 40 + Math.min(30, (postPurchaseDebtRatio - DTI_DANGER) * 2)
    } else {
      score -= (postPurchaseDebtRatio / DTI_DANGER) * 20
    }
  }

  // 2. Emergency fund. Draining the buffer below three months of expenses is the
  //    single most consequential mistake this engine exists to prevent.
  if (cashPurchase) {
    if (afterPurchase < 0) {
      score -= 60
    } else if (emergencyFundImpact.status === 'Kritis') {
      const coverage = emergencyFloor > 0 ? afterPurchase / emergencyFloor : 1
      score -= 20 + (1 - clamp(coverage, 0, 1)) * 25
    }
  }

  // 3. Share of this month's free cash.
  if (percentOfRemainingBudget > 100) score -= 25
  else if (percentOfRemainingBudget > 50) score -= 12
  else if (percentOfRemainingBudget > 25) score -= 5

  score = Math.round(clamp(score, 0, 100))

  // ── Decision ───────────────────────────────────────────────────
  // Two hard overrides come before the score: an over-leveraged DTI and a drained
  // emergency fund are disqualifying regardless of how the rest of the picture looks.

  let decision: AffordabilityDecision
  if (!cashPurchase && postPurchaseDebtRatio > DTI_DANGER) {
    decision = 'Tunda (Risiko Tinggi)'
  } else if (cashPurchase && afterPurchase < 0) {
    decision = 'Tunda (Risiko Tinggi)'
  } else if (cashPurchase && emergencyFundImpact.status === 'Kritis') {
    decision = 'Gunakan Tabungan'
  } else if (score >= 70) {
    decision = 'Aman Dibeli'
  } else if (score >= 45) {
    decision = 'Gunakan Tabungan'
  } else {
    decision = 'Tunda (Risiko Tinggi)'
  }

  // ── Insights ───────────────────────────────────────────────────

  const insights: string[] = []

  if (!cashPurchase && monthlyInstallment > 0) {
    insights.push(
      postPurchaseDebtRatio > DTI_DANGER
        ? `Mencicil barang ini membuat rasio utang bulananmu naik menjadi ${formatPercent(postPurchaseDebtRatio)} — di atas batas aman ${formatPercent(DTI_DANGER)}.`
        : `Setelah cicilan ini, rasio utang bulananmu menjadi ${formatPercent(postPurchaseDebtRatio)}, masih di bawah batas aman ${formatPercent(DTI_DANGER)}.`,
    )
  }

  if (cashPurchase) {
    if (afterPurchase < 0) {
      insights.push(
        `Dana likuidmu ${formatIDR(liquidAssets)} tidak cukup untuk membayar ${formatIDR(price)} secara tunai.`,
      )
    } else if (emergencyFundImpact.status === 'Kritis') {
      insights.push(
        `Membeli tunai menyisakan ${formatIDR(afterPurchase)}, di bawah dana darurat ideal ${formatIDR(emergencyFloor)} (3x pengeluaran bulanan).`,
      )
    } else {
      insights.push(
        `Setelah pembelian, dana likuidmu masih ${formatIDR(afterPurchase)} — di atas dana darurat ideal ${formatIDR(emergencyFloor)}.`,
      )
    }
  }

  insights.push(
    remainingBudget > 0
      ? `Harga ini setara ${formatPercent(percentOfRemainingBudget)} dari sisa anggaran bulan ini (${formatIDR(remainingBudget)}).`
      : 'Anggaran bulan ini sudah habis, jadi pembelian ini seluruhnya di luar rencana.',
  )

  insights.push(
    `Jika ${formatIDR(price)} ini kamu investasikan di SBN ${formatPercent(SBN_ANNUAL_RATE * 100)}, ${OPPORTUNITY_YEARS} tahun lagi menjadi ${formatIDR(opportunityCost5Years)}.`,
  )

  return {
    recommendationScore: score,
    decision,
    metrics: {
      percentOfRemainingBudget,
      emergencyFundImpact,
      postPurchaseDebtRatio,
      opportunityCost5Years,
    },
    insights,
  }
}

/** Whether a cooling-off period is still running. */
export function isCoolingOff(item: Wishlist, now = new Date()): boolean {
  if (!item.coolingOffEndDate) return false
  return item.coolingOffEndDate.toDate() > now
}

/** Whole days left in the cooling-off period, zero once it has elapsed. */
export function coolingOffDaysLeft(item: Wishlist, now = new Date()): number {
  if (!item.coolingOffEndDate) return 0
  const ms = item.coolingOffEndDate.toDate().getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000))
}
