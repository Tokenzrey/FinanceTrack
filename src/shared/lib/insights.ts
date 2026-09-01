import { formatIDR, formatPercent } from './format'
import { regretTotal, topMerchants } from './analytics'
import type { MonthlySummary, Transaction } from '@/shared/types/domain'

export interface Insight {
  id: string
  title: string
  body: string
  tone: 'good' | 'warn' | 'info'
}

/**
 * Generates the dashboard's insight carousel from data already on screen.
 *
 * Every line is derived arithmetic, never a guess: each one names the number it came
 * from so the user can check it against the tables on the same page.
 */
export function buildInsights(summary: MonthlySummary, transactions: Transaction[]): Insight[] {
  const insights: Insight[] = []
  const spendCategories = summary.categories.filter((c) => c.category.pillar !== 'income')

  // 1. Savings rate against the conventional 20% target.
  if (summary.totalIncome > 0) {
    const rate = summary.savingsRate
    insights.push({
      id: 'savings-rate',
      title: rate >= 20 ? 'Rasio tabungan sehat' : 'Rasio tabungan di bawah target',
      body:
        rate >= 20
          ? `Kamu menabung ${formatPercent(rate)} dari pemasukan — di atas patokan umum 20%.`
          : `Kamu menabung ${formatPercent(rate)} dari pemasukan. Target umum adalah 20%.`,
      tone: rate >= 20 ? 'good' : 'warn',
    })
  }

  // 2. The category eating the most budget.
  const biggest = [...spendCategories].sort((a, b) => b.used - a.used)[0]
  if (biggest && biggest.used > 0) {
    insights.push({
      id: 'biggest-category',
      title: `${biggest.category.name} paling besar bulan ini`,
      body: `${formatIDR(biggest.used)} terpakai, ${formatPercent(biggest.absorptionRate)} dari anggarannya.`,
      tone: biggest.absorptionRate > 100 ? 'warn' : 'info',
    })
  }

  // 3. Categories on track to overshoot.
  const projected = spendCategories.filter(
    (row) => row.budget > 0 && row.projectedMonthEnd > row.budget,
  )
  if (projected.length > 0) {
    insights.push({
      id: 'burn-rate',
      title: `${projected.length} kategori melaju di atas anggaran`,
      body: `Dengan laju sekarang, ${projected
        .slice(0, 3)
        .map((row) => row.category.name)
        .join(', ')} akan melewati batas sebelum bulan berakhir.`,
      tone: 'warn',
    })
  }

  // 4. Regretted spending, when the user actually tags moods.
  const regret = regretTotal(transactions)
  if (regret > 0) {
    insights.push({
      id: 'regret',
      title: 'Pengeluaran yang disesali',
      body: `${formatIDR(regret)} ditandai "menyesal" bulan ini — pola yang layak ditinjau.`,
      tone: 'warn',
    })
  }

  // 5. Repeat merchant.
  const merchant = topMerchants(transactions, 1)[0]
  if (merchant && merchant.count >= 3) {
    insights.push({
      id: 'merchant',
      title: `Sering belanja di ${merchant.name}`,
      body: `${merchant.count} transaksi, total ${formatIDR(merchant.total)} (rata-rata ${formatIDR(merchant.average)}).`,
      tone: 'info',
    })
  }

  // 6. Under-used budget worth reallocating.
  const idle = spendCategories.filter(
    (row) => row.budget > 0 && row.absorptionRate < 40 && row.category.pillar !== 'savings',
  )
  if (idle.length > 0 && summary.totalBudget > 0) {
    const spare = idle.reduce((sum, row) => sum + row.remaining, 0)
    insights.push({
      id: 'idle-budget',
      title: 'Ada anggaran yang menganggur',
      body: `${formatIDR(spare)} belum terpakai di ${idle.length} kategori. Bisa dialihkan ke tabungan.`,
      tone: 'good',
    })
  }

  return insights
}

/**
 * Description suggestions for the transaction form, drawn from what the user has
 * written before in the same category — most recent first, deduplicated.
 */
export function describeSuggestions(
  transactions: Transaction[],
  categoryId: string,
  query: string,
  limit = 5,
): string[] {
  const needle = query.trim().toLowerCase()

  const seen = new Set<string>()
  const suggestions: string[] = []

  const candidates = [...transactions]
    .filter((tx) => tx.description?.trim())
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())

  // Same-category history first — it is far likelier to be what the user means.
  for (const pool of [
    candidates.filter((tx) => tx.categoryId === categoryId),
    candidates.filter((tx) => tx.categoryId !== categoryId),
  ]) {
    for (const tx of pool) {
      const description = tx.description!.trim()
      const key = description.toLowerCase()
      if (seen.has(key)) continue
      if (needle && !key.includes(needle)) continue

      seen.add(key)
      suggestions.push(description)
      if (suggestions.length >= limit) return suggestions
    }
  }

  return suggestions
}
