import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatIDR, formatMonthShort, formatPercent } from '@/shared/lib/format'
import { savingsRateOf, type YearSummary } from '@/shared/lib/year-summary'

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
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, padding: 8 },
  kpiLabel: { fontSize: 7, color: '#64748B', marginBottom: 3 },
  kpiValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
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
  colMonth: { flex: 1.2 },
  colNum: { flex: 1.4, textAlign: 'right' },
  highlight: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    gap: 3,
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

/** One-page year in review. */
export function AnnualReportDocument({
  summary,
  generatedAt = new Date(),
}: {
  summary: YearSummary
  generatedAt?: Date
}) {
  const logged = summary.months.filter((month) => month.hasData)

  return (
    <Document title={`FinTrack ${summary.year}`} author="FinTrack">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Laporan Tahunan {summary.year}</Text>
            <Text style={styles.subtitle}>
              Dibuat {generatedAt.toLocaleDateString('id-ID', { dateStyle: 'long' })}
            </Text>
          </View>
          <Text style={styles.brand}>FinTrack</Text>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total pemasukan</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalIncome)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total belanja</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalSpending)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total ditabung</Text>
            <Text style={styles.kpiValue}>{formatIDR(summary.totalSaved)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Rasio tabungan</Text>
            <Text style={styles.kpiValue}>{formatPercent(summary.savingsRate)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Rekap per bulan</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colMonth]}>Bulan</Text>
          <Text style={[styles.th, styles.colNum]}>Pemasukan</Text>
          <Text style={[styles.th, styles.colNum]}>Belanja</Text>
          <Text style={[styles.th, styles.colNum]}>Tabungan</Text>
          <Text style={[styles.th, styles.colNum]}>Serapan</Text>
        </View>
        {logged.map((month) => (
          <View key={month.month} style={styles.tableRow}>
            <Text style={[styles.td, styles.colMonth]}>
              {formatMonthShort(month.year, month.month)}
            </Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(month.income)}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(month.spending)}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatIDR(month.saved)}</Text>
            <Text style={[styles.td, styles.colNum]}>{formatPercent(month.absorptionRate)}</Text>
          </View>
        ))}

        <View style={styles.highlight}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>Sorotan tahun ini</Text>
          {summary.bestMonth && (
            <Text style={{ fontSize: 8, color: '#334155' }}>
              Bulan terbaik: {formatMonthShort(summary.bestMonth.year, summary.bestMonth.month)} —
              menabung {formatPercent(savingsRateOf(summary.bestMonth))} dari pemasukan.
            </Text>
          )}
          {summary.worstMonth && (
            <Text style={{ fontSize: 8, color: '#334155' }}>
              Bulan terberat: {formatMonthShort(summary.worstMonth.year, summary.worstMonth.month)}{' '}
              — menabung {formatPercent(savingsRateOf(summary.worstMonth))} dari pemasukan.
            </Text>
          )}
          <Text style={{ fontSize: 8, color: '#334155' }}>
            Streak pencatatan terakhir: {summary.loggingStreak} bulan berturut-turut.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>FinTrack — Laporan Tahunan {summary.year}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
