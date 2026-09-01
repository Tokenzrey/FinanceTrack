'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarRange, ChevronLeft, ChevronRight, Download, History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { AbsorptionBar } from '@/shared/components/finance/AbsorptionBar'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { downloadCsv, transactionsToCsv } from '@/shared/lib/csv-export'
import { seasonalityByCategory } from '@/shared/lib/analytics'
import { formatMonthLong, formatMonthShort } from '@/shared/lib/format'
import { getYearHistory, type YearHistory } from '@/shared/use-cases/history/GetYearHistory.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import { CategoryTrendChart } from './components/CategoryTrendChart'
import { ComparisonPanel } from './components/ComparisonPanel'
import { MonthHeatmap } from './components/MonthHeatmap'
import { YearOverview } from './components/YearOverview'

/** "Transportasi konsisten melonjak di Desember" — the peak spending month per category. */
function SeasonalityCard({ year, data }: { year: number; data: YearHistory }) {
  const rows = seasonalityByCategory(year, data.transactions, data.categories).slice(0, 6)
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">Pola musiman kategori</CardTitle>
        <p className="text-xs text-muted-foreground">Bulan dengan pengeluaran tertinggi per kategori.</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.categoryId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="text-xs text-muted-foreground">
                puncak {formatMonthShort(year, row.peakMonth)}
              </span>
              <MoneyDisplay value={row.peakAmount} compact className="font-medium" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function MonthGrid({ data }: { data: YearHistory }) {
  const months = data.summary.months.filter((month) => month.hasData)

  if (months.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">Rincian bulanan</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {months.map((month) => (
            <li key={month.month}>
              <Link
                href={`/history/${month.year}/${month.month}`}
                className="block space-y-2 rounded-xl border p-3 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{formatMonthLong(month.year, month.month)}</p>
                  <span className="text-xs text-muted-foreground">
                    {month.transactionCount} transaksi
                  </span>
                </div>

                <AbsorptionBar rate={month.absorptionRate} size="sm" />

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Belanja{' '}
                    <MoneyDisplay value={month.spending} compact className="text-foreground" />
                  </span>
                  <span>
                    Tabungan{' '}
                    <MoneyDisplay value={month.saved} compact className="text-foreground" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function HistoryPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<YearHistory | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    setLoading(true)
    getYearHistory(userId, year)
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && toast.error('Gagal memuat riwayat'))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [userId, year])

  const exportCsv = () => {
    if (!data) return
    const csv = transactionsToCsv(data.transactions, data.categories)
    downloadCsv(`fintrack-${year}.csv`, csv)
    toast.success(`${data.transactions.length} transaksi diekspor`)
  }

  const hasAnyData = data?.summary.months.some((month) => month.hasData) ?? false

  return (
    <div className="space-y-4">
      <PageHeader
        title="Riwayat"
        description="Ringkasan tahunan dan perbandingan antar bulan."
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setYear(year - 1)}
                aria-label="Tahun sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[4rem] text-center font-display text-sm font-semibold">
                {year}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setYear(year + 1)}
                aria-label="Tahun berikutnya"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <Button variant="outline" onClick={exportCsv} disabled={!hasAnyData} className="gap-2">
              <Download className="size-4" aria-hidden />
              Ekspor CSV
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={6} />
          </CardContent>
        </Card>
      ) : !hasAnyData ? (
        <EmptyState
          icon={History}
          title={`Belum ada data untuk ${year}`}
          description="Catat transaksi atau atur anggaran untuk mulai membangun riwayat."
        />
      ) : (
        data && (
          <>
            <YearOverview summary={data.summary} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarRange className="size-4" aria-hidden />
                  Peta serapan {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MonthHeatmap months={data.summary.months} />
              </CardContent>
            </Card>

            <MonthGrid data={data} />

            <SeasonalityCard year={year} data={data} />

            <ComparisonPanel
              year={year}
              transactions={data.transactions}
              categories={data.categories}
            />

            <CategoryTrendChart
              year={year}
              transactions={data.transactions}
              categories={data.categories}
            />
          </>
        )
      )}
    </div>
  )
}
