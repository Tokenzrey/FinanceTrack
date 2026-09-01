import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatIDR, formatMonthLong, formatPercent } from '@/shared/lib/format'
import type { MonthlySummary, SavingsGoal, Transaction } from '@/shared/types/domain'

/**
 * Monthly PDF. Built with @react-pdf primitives, not the app's components — react-pdf
 * renders to its own layout engine and understands none of Tailwind or the DOM.
 *
 * Uses the built-in Helvetica rather than the app's Sora/Inter: registering web fonts
 * means shipping the font files, and a report is a printable artefact, not brand surface.
 */

const PILLAR_HEX = {
  needs: '#14B8A6',
  wants: '#F97316',
  savings: '#8B5CF6',
} as const

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: '#0F172A', fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: '#14B8A6',
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 9, color: '#64748B', marginTop: 2 },
  brand: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#14B8A6' },

  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
  },

  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
  },
  kpiLabel: { fontSize: 7, color: '#64748B', marginBottom: 3 },
  kpiValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  barTrack: { flexDirection: 'row', height: 14, borderRadius: 3, overflow: 'hidden', gap: 1 },
  legendRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 7, color: '#475569' },

  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 3.5,
  },
  th: { fontSize: 7, color: '#64748B', fontFamily: 'Helvetica-Bold' },
  td: { fontSize: 8 },

  colName: { flex: 2.2 },
  colNum: { flex: 1.2, textAlign: 'right' },
  colRate: { flex: 1, textAlign: 'right' },

  notes: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#94A3B8',
  },
})

export interface MonthlyReportProps {
  summary: MonthlySummary
  transactions: Transaction[]
  goals?: SavingsGoal[]
  notes?: string
  generatedAt?: Date
}

export function MonthlyReportDocument({
  summary,
  transactions,
  goals = [],
  notes,
  generatedAt = new Date(),
}: MonthlyReportProps) {
  const spending = summary.totalUsed - summary.totalSaved
  const spendCategories = summary.categories.filter((c) => c.category.pillar !== 'income')

  const topExpenses = [...transactions]
    .filter((tx) => tx.type !== 'income')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const allocation = (['needs', 'wants', 'savings'] as const).map((pillar) => ({
    pillar,
    budget: summary.pillarSummary[pillar].budget,
  }))
  const allocationTotal = allocation.reduce((sum, item) => sum + item.budget, 0) || 1

  return (
    <Document title={`FinTrack ${formatMonthLong(summary.year, summary.month)}`} author="FinTrack">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Laporan {formatMonthLong(summary.year, summary.month)}</Text>
            <Text style={styles.subtitle}>
              Dibuat {generatedAt.toLocaleDateString('id-ID', { dateStyle: 'long' })}
            </Text>
          </View>
          <Text style={styles.brand}>FinTrack</Text>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pemasukan</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalIncome)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Dianggarkan</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalBudget)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Belanja</Text>
            <Text style={styles.kpiValue}>{formatIDR(spending)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ditabung</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalSaved)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Rasio tabungan</Text>
            <Text style={styles.kpiValue}>{formatPercent(summary.savingsRate)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Alokasi per pilar</Text>
        <View style={styles.barTrack}>
          {allocation.map((item) => (
            <View
              key={item.pillar}
              style={{
                width: `${(item.budget / allocationTotal) * 100}%`,
                backgroundColor: PILLAR_HEX[item.pillar],
              }}
            />
          ))}
        </View>
        <View style={styles.legendRow}>
          {allocation.map((item) => (
            <View key={item.pillar} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PILLAR_HEX[item.pillar] }]} />
              <Text style={styles.legendText}>
                {item.pillar === 'needs'
                  ? 'Kebutuhan'
                  : item.pillar === 'wants'
                    ? 'Keinginan'
                    : 'Tabungan'}
                {' — '}
                {formatIDR(item.budget)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Rincian kategori</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colName]}>Kategori</Text>
          <Text style={[styles.th, styles.colNum]}>Anggaran</Text>
          <Text style={[styles.th, styles.colNum]}>Terpakai</Text>
          <Text style={[styles.th, styles.colNum]}>Sisa</Text>
          <Text style={[styles.th, styles.colRate]}>Serapan</Text>
        </View>
        {spendCategories.map((row) => (
          <View key={row.category.id} style={styles.tableRow}>
            <Text style={[styles.td, styles.colName]}>{row.category.name}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(row.budget)}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(row.used)}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(row.remaining)}</Text>
            <Text style={[styles.td, styles.colRate]}>{formatPercent(row.absorptionRate)}</Text>
          </View>
        ))}

        {topExpenses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>5 pengeluaran terbesar</Text>
            {topExpenses.map((tx) => (
              <View key={tx.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colName]}>
                  {tx.description || tx.location || 'Tanpa keterangan'}
                </Text>
                <Text style={[styles.td, styles.colNum]}>
                  {tx.date.toDate().toLocaleDateString('id-ID')}
                </Text>
                <Text style={[styles.td, styles.colNum]}>{formatIDR(tx.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {goals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Progres target tabungan</Text>
            {goals.map((goal) => (
              <View key={goal.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colName]}>{goal.name}</Text>
                <Text style={[styles.td, styles.colNum]}>{formatIDR(goal.currentAmount)}</Text>
                <Text style={[styles.td, styles.colNum]}>{formatIDR(goal.targetAmount)}</Text>
                <Text style={[styles.td, styles.colRate]}>
                  {formatPercent(
                    goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0,
                  )}
                </Text>
              </View>
            ))}
          </>
        )}

        {notes && (
          <View style={styles.notes}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
              Catatan bulan ini
            </Text>
            <Text style={{ fontSize: 8, color: '#334155' }}>{notes}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>FinTrack — {formatMonthLong(summary.year, summary.month)}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
