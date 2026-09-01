'use client'

import { useEffect, useState } from 'react'
import {
  CalendarRange,
  CloudUpload,
  FileDown,
  FileJson,
  FileText,
  Loader2,
  Share2,
  Table,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import { downloadCsv, transactionsToCsv } from '@/shared/lib/csv-export'
import { formatMonthLong, formatPercent } from '@/shared/lib/format'
import { getOrCreateFinTrackFolders, uploadFileToGDrive } from '@/shared/lib/gdrive'
import { encodeSharedReport, type SharedReportPayload } from '@/shared/lib/share-report'
import { useGoogleDrive } from '@/shared/hooks/useGoogleDrive'
import { repositories } from '@/shared/repositories'
import { getMonthlySummary } from '@/shared/use-cases/budget/GetMonthlySummary.usecase'
import { getYearHistory } from '@/shared/use-cases/history/GetYearHistory.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import type { Pillar } from '@/shared/types/domain'

/**
 * @react-pdf is imported lazily: the renderer is ~1 MB, and a user who never exports
 * should not pay for it on first paint.
 */
async function buildMonthlyPdfBlob(props: {
  summary: Awaited<ReturnType<typeof getMonthlySummary>>
  transactions: Awaited<ReturnType<typeof repositories.transactions.findByMonth>>
  goals: Awaited<ReturnType<typeof repositories.goals.findAll>>
  notes?: string
}) {
  const [{ pdf }, { MonthlyReportDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./MonthlyReportDocument'),
  ])
  const element = (
    <MonthlyReportDocument
      summary={props.summary}
      transactions={props.transactions}
      goals={props.goals}
      notes={props.notes}
    />
  )
  return pdf(element).toBlob()
}

async function buildAnnualPdfBlob(summary: Awaited<ReturnType<typeof getYearHistory>>['summary']) {
  const [{ pdf }, { AnnualReportDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./AnnualReportDocument'),
  ])
  return pdf(<AnnualReportDocument summary={summary} />).toBlob()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Simpan ke Drive" button — only rendered when Drive is actually configured. */
function SaveToDriveButton({
  label,
  busy,
  onClick,
}: {
  label: string
  busy: boolean
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={busy} className="w-full gap-2">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
      {label}
    </Button>
  )
}

export function ReportsPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const monthlyBudget = useBudgetStore((s) => s.monthlyBudget)
  const summary = useBudgetStore((s) => s.summary)
  const loadSummary = useBudgetStore((s) => s.loadSummary)
  const { executeWithToken, isConfigured: driveConfigured } = useGoogleDrive()

  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<'monthly' | 'annual' | 'csv' | 'json' | null>(null)
  const [drive, setDrive] = useState<'monthly' | 'annual' | 'csv' | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadSummary()
  }, [userId, year, month, loadSummary])

  useEffect(() => {
    setNotes(monthlyBudget?.notes ?? '')
  }, [monthlyBudget?.notes])

  const saveNotes = async () => {
    if (!userId) return
    await repositories.budgets.upsert(userId, { year, month, notes })
    toast.success('Catatan disimpan')
  }

  /** Uploads a blob into `FinTrack/Exports`, creating the folder tree on first use. */
  const saveToExportsFolder = async (blob: Blob, filename: string) => {
    await executeWithToken(async (token) => {
      const { exportsId } = await getOrCreateFinTrackFolders(token)
      await uploadFileToGDrive(blob, filename, exportsId, token)
    })
  }

  const exportMonthlyPdf = async (target: 'download' | 'drive') => {
    if (!userId) return
    if (target === 'download') setBusy('monthly')
    else setDrive('monthly')
    try {
      const [monthlySummary, transactions, goals] = await Promise.all([
        getMonthlySummary(userId, year, month),
        repositories.transactions.findByMonth(userId, year, month),
        repositories.goals.findAll(userId),
      ])

      if (transactions.length === 0) {
        toast.error('Belum ada transaksi di bulan ini')
        return
      }

      const blob = await buildMonthlyPdfBlob({
        summary: monthlySummary,
        transactions,
        goals,
        notes: notes || undefined,
      })
      const filename = `fintrack-${year}-${String(month).padStart(2, '0')}.pdf`

      if (target === 'download') {
        downloadBlob(blob, filename)
        toast.success('Laporan bulanan diunduh')
      } else {
        await saveToExportsFolder(blob, filename)
        toast.success('Laporan bulanan disimpan ke Google Drive')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuat PDF')
    } finally {
      if (target === 'download') setBusy(null)
      else setDrive(null)
    }
  }

  const exportAnnualPdf = async (target: 'download' | 'drive') => {
    if (!userId) return
    if (target === 'download') setBusy('annual')
    else setDrive('annual')
    try {
      const { summary: yearSummary } = await getYearHistory(userId, year)

      if (!yearSummary.months.some((m) => m.hasData)) {
        toast.error(`Belum ada data untuk ${year}`)
        return
      }

      const blob = await buildAnnualPdfBlob(yearSummary)
      const filename = `fintrack-${year}.pdf`

      if (target === 'download') {
        downloadBlob(blob, filename)
        toast.success('Laporan tahunan diunduh')
      } else {
        await saveToExportsFolder(blob, filename)
        toast.success('Laporan tahunan disimpan ke Google Drive')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuat PDF')
    } finally {
      if (target === 'download') setBusy(null)
      else setDrive(null)
    }
  }

  const exportCsv = async (target: 'download' | 'drive') => {
    if (!userId) return
    if (target === 'download') setBusy('csv')
    else setDrive('csv')
    try {
      const [transactions, categories] = await Promise.all([
        repositories.transactions.findByMonth(userId, year, month),
        repositories.categories.findAll(userId),
      ])

      if (transactions.length === 0) {
        toast.error('Belum ada transaksi di bulan ini')
        return
      }

      const csv = transactionsToCsv(transactions, categories)
      const filename = `fintrack-${year}-${String(month).padStart(2, '0')}.csv`

      if (target === 'download') {
        downloadCsv(filename, csv)
        toast.success(`${transactions.length} transaksi diekspor`)
      } else {
        await saveToExportsFolder(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename)
        toast.success('CSV disimpan ke Google Drive')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengekspor CSV')
    } finally {
      if (target === 'download') setBusy(null)
      else setDrive(null)
    }
  }

  const exportJson = async () => {
    if (!userId) return
    setBusy('json')
    try {
      const [monthlySummary, transactions] = await Promise.all([
        getMonthlySummary(userId, year, month),
        repositories.transactions.findByMonth(userId, year, month),
      ])

      if (transactions.length === 0) {
        toast.error('Belum ada transaksi di bulan ini')
        return
      }

      const payload = {
        period: { year, month },
        summary: {
          totalIncome: monthlySummary.totalIncome,
          totalBudget: monthlySummary.totalBudget,
          totalUsed: monthlySummary.totalUsed,
          totalSaved: monthlySummary.totalSaved,
          savingsRate: monthlySummary.savingsRate,
        },
        transactions: transactions.map((tx) => ({
          date: tx.date.toDate().toISOString(),
          type: tx.type,
          pillar: tx.pillar,
          categoryId: tx.categoryId,
          amount: tx.amount,
          description: tx.description ?? null,
          location: tx.location ?? null,
          tags: tx.tags,
        })),
      }

      downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `fintrack-${year}-${String(month).padStart(2, '0')}.json`,
      )
      toast.success(`${transactions.length} transaksi diekspor sebagai JSON`)
    } finally {
      setBusy(null)
    }
  }

  /**
   * Encodes the already-computed monthly summary into the URL itself — no server row,
   * no auth on the receiving end, and structurally nothing beyond these aggregate
   * numbers can ever leak through it (see `share-report.ts`).
   */
  const buildShareLink = () => {
    if (!summary) return
    const payload: SharedReportPayload = {
      v: 1,
      year,
      month,
      totalIncome: summary.totalIncome,
      totalBudget: summary.totalBudget,
      totalUsed: summary.totalUsed,
      totalSaved: summary.totalSaved,
      savingsRate: summary.savingsRate,
      netCashFlow: summary.netCashFlow,
      pillars: (Object.entries(summary.pillarSummary) as [Pillar, { budget: number; used: number }][]).map(
        ([pillar, v]) => ({ pillar, budget: v.budget, used: v.used }),
      ),
      categories: summary.categories
        // Income categories are handled as the separate `pillars.income` aggregate —
        // excluded here for the same reason `compareMonths` and `budget-math.ts`'s own
        // `spendSummaries` exclude them from every other category-level breakdown:
        // an income category's `budget`/`used` don't mean "spent against a budget".
        .filter((c) => c.category.pillar !== 'income' && (c.budget > 0 || c.used > 0))
        .map((c) => ({
          name: c.category.name,
          pillar: c.category.pillar,
          budget: c.budget,
          used: c.used,
        })),
    }
    setShareUrl(`${window.location.origin}/share/report?d=${encodeSharedReport(payload)}`)
  }

  const copyShareLink = () => {
    if (!shareUrl) return
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => toast.success('Tautan disalin'))
      .catch(() => toast.error('Gagal menyalin — salin manual dari kotak teks'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan"
        description="Ekspor ringkasan keuangan sebagai PDF, CSV, atau JSON."
        actions={<PeriodSelector />}
      />

      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">
              Ringkasan {formatMonthLong(year, month)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Pemasukan</p>
              <MoneyDisplay value={summary.totalIncome} compact className="text-sm font-semibold" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Terpakai</p>
              <MoneyDisplay value={summary.totalUsed} compact className="text-sm font-semibold" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ditabung</p>
              <MoneyDisplay value={summary.totalSaved} compact className="text-sm font-semibold" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rasio tabungan</p>
              <p className="tabular text-sm font-semibold">{formatPercent(summary.savingsRate)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Catatan bulan ini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-notes" className="text-xs">
              Ikut tercetak di laporan bulanan
            </Label>
            <Textarea
              id="report-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Bulan ini banyak pengeluaran tak terduga karena servis motor…"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void saveNotes()}>
            Simpan catatan
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Laporan bulanan</p>
              <p className="text-xs text-muted-foreground">
                KPI, alokasi pilar, rincian kategori, 5 pengeluaran terbesar, dan progres target.
              </p>
            </div>
            <Button
              onClick={() => void exportMonthlyPdf('download')}
              disabled={busy !== null}
              className="w-full gap-2"
            >
              {busy === 'monthly' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              Unduh PDF
            </Button>
            {driveConfigured && (
              <SaveToDriveButton
                label="Simpan ke Drive"
                busy={drive === 'monthly'}
                onClick={() => void exportMonthlyPdf('drive')}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-savings/10 text-savings">
              <CalendarRange className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Laporan tahunan {year}</p>
              <p className="text-xs text-muted-foreground">
                Rekap 12 bulan, rasio tabungan, dan sorotan bulan terbaik serta terberat.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void exportAnnualPdf('download')}
              disabled={busy !== null}
              className="w-full gap-2"
            >
              {busy === 'annual' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              Unduh PDF
            </Button>
            {driveConfigured && (
              <SaveToDriveButton
                label="Simpan ke Drive"
                busy={drive === 'annual'}
                onClick={() => void exportAnnualPdf('drive')}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-needs/10 text-needs">
              <Table className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Ekspor CSV</p>
              <p className="text-xs text-muted-foreground">
                Semua transaksi bulan ini, siap dibuka di Google Sheets atau Excel.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void exportCsv('download')}
              disabled={busy !== null}
              className="w-full gap-2"
            >
              {busy === 'csv' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              Unduh CSV
            </Button>
            {driveConfigured && (
              <SaveToDriveButton
                label="Simpan ke Drive"
                busy={drive === 'csv'}
                onClick={() => void exportCsv('drive')}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-wants/10 text-wants">
              <FileJson className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Ekspor JSON</p>
              <p className="text-xs text-muted-foreground">
                Ringkasan dan transaksi mentah, untuk diolah di alat lain.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void exportJson()}
              disabled={busy !== null}
              className="w-full gap-2"
            >
              {busy === 'json' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              Unduh JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-savings/10 text-savings">
              <Share2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Bagikan laporan</p>
              <p className="text-xs text-muted-foreground">
                Tautan baca-saja berisi angka ringkasan bulan ini — bukan transaksi mentah.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={buildShareLink}
              disabled={!summary}
              className="w-full gap-2"
            >
              <Share2 className="size-4" aria-hidden />
              Buat tautan
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(shareUrl)} onOpenChange={(open) => !open && setShareUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tautan laporan</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Siapa pun dengan tautan ini bisa melihat ringkasan {formatMonthLong(year, month)} —
            hanya angka ringkasan seperti di halaman ini, tanpa transaksi mentah atau data akunmu.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={shareUrl ?? ''}
              onFocus={(event) => event.target.select()}
              className="text-xs"
            />
            <Button onClick={copyShareLink}>Salin</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
