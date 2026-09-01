'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Input } from '@/shared/components/ui/input'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { cn } from '@/shared/lib/utils'
import { formatMonthLong, formatPercent } from '@/shared/lib/format'
import { compareMonths } from '@/shared/lib/year-summary'
import { getYearHistory } from '@/shared/use-cases/history/GetYearHistory.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Category, Transaction } from '@/shared/types/domain'

type Mode = 'month' | 'year'

interface ComparisonPanelProps {
  year: number
  transactions: Transaction[]
  categories: Category[]
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'month', label: 'Bulan vs bulan' },
  { value: 'year', label: 'Tahun vs tahun' },
]

/** Shared by the desktop table and the mobile card list — same badge, one definition. */
function DiffBadge({ diff, percentChange }: { diff: number; percentChange: number | null }) {
  const stable = diff === 0
  const up = diff > 0
  const Icon = stable ? Minus : up ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'tabular inline-flex shrink-0 items-center justify-end gap-1 text-xs font-medium',
        // Spending up is bad, down is good.
        stable ? 'text-muted-foreground' : up ? 'text-exceeded' : 'text-safe',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {percentChange === null ? 'baru' : formatPercent(Math.abs(percentChange))}
    </span>
  )
}

/** Compares two months of the loaded year, or the loaded year against another year
 *  entirely — same underlying category-diff math either way, just fed different
 *  transaction sets (`compareMonths` is not actually month-specific). */
export function ComparisonPanel({ year, transactions, categories }: ComparisonPanelProps) {
  const userId = useAuthStore((s) => s.user?.uid)
  const now = new Date()
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12

  const [mode, setMode] = useState<Mode>('month')
  const [monthA, setMonthA] = useState(Math.max(1, currentMonth - 1))
  const [monthB, setMonthB] = useState(currentMonth)

  const [compareYear, setCompareYear] = useState(year - 1)
  const [compareYearDraft, setCompareYearDraft] = useState(String(year - 1))
  const [compareYearTx, setCompareYearTx] = useState<Transaction[] | null>(null)
  const [loadingYear, setLoadingYear] = useState(false)

  // `year` is a prop, not state ComparisonPanel owns — if the page navigates to a
  // different year while this stays mounted, a `compareYear` left over from before
  // could silently coincide with the new `year` (comparing a year against itself) or
  // just feel stale. Re-derive the default whenever the primary period changes.
  useEffect(() => {
    setCompareYear(year - 1)
    setCompareYearDraft(String(year - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const commitCompareYear = () => {
    const parsed = Number(compareYearDraft)
    if (Number.isInteger(parsed) && parsed > 1900 && parsed < 2200) setCompareYear(parsed)
    else setCompareYearDraft(String(compareYear)) // invalid/partial input — revert, don't fetch
  }

  useEffect(() => {
    if (mode !== 'year' || !userId) return
    let cancelled = false
    setLoadingYear(true)
    setCompareYearTx(null)
    getYearHistory(userId, compareYear)
      .then((result) => !cancelled && setCompareYearTx(result.transactions))
      .catch(() => !cancelled && toast.error(`Gagal memuat data ${compareYear}`))
      .finally(() => !cancelled && setLoadingYear(false))
    return () => {
      cancelled = true
    }
  }, [mode, compareYear, userId])

  const inMonth = (month: number) =>
    transactions.filter((tx) => {
      const date = tx.date.toDate()
      return date.getFullYear() === year && date.getMonth() + 1 === month
    })

  const monthRows = useMemo(
    () => compareMonths(inMonth(monthA), inMonth(monthB), categories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, categories, monthA, monthB, year],
  )

  const yearRows = useMemo(
    () => (compareYearTx ? compareMonths(compareYearTx, transactions, categories) : []),
    [compareYearTx, transactions, categories],
  )

  const rows = mode === 'month' ? monthRows : yearRows
  const labelA = mode === 'month' ? formatMonthLong(year, monthA) : String(compareYear)
  const labelB = mode === 'month' ? formatMonthLong(year, monthB) : String(year)

  const totalA = rows.reduce((sum, row) => sum + row.a, 0)
  const totalB = rows.reduce((sum, row) => sum + row.b, 0)
  const totalDiff = totalB - totalA

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-display text-base">Bandingkan</CardTitle>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'month' ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={String(monthA)} onValueChange={(value) => setMonthA(Number(value))}>
              <SelectTrigger className="w-40" aria-label="Bulan pembanding A">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <SelectItem key={month} value={String(month)}>
                    {formatMonthLong(year, month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground">vs</span>

            <Select value={String(monthB)} onValueChange={(value) => setMonthB(Number(value))}>
              <SelectTrigger className="w-40" aria-label="Bulan pembanding B">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <SelectItem key={month} value={String(month)}>
                    {formatMonthLong(year, month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Input
              type="number"
              value={compareYearDraft}
              onChange={(event) => setCompareYearDraft(event.target.value)}
              onBlur={commitCompareYear}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="w-24"
              aria-label="Tahun pembanding"
            />
            <span className="text-xs text-muted-foreground">vs {year} (tahun ini)</span>
            {loadingYear && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {mode === 'year' && loadingYear ? (
          <p className="text-sm text-muted-foreground">Memuat {compareYear}…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada transaksi di {mode === 'month' ? 'kedua bulan' : 'kedua tahun'} tersebut.
          </p>
        ) : (
          <>
            {/* The table needs ~440px to show four columns side by side — below `lg`
                that forced horizontal scroll, so a stacked list takes over instead. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <caption className="sr-only">
                  Perbandingan pengeluaran per kategori antara dua periode
                </caption>
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 text-left font-medium">
                      Kategori
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {labelA}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {labelB}
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">
                      Selisih
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.categoryId} className="border-b last:border-0">
                      <td className="py-2 pr-2">{row.name}</td>
                      <td className="py-2 text-right">
                        <MoneyDisplay value={row.a} compact />
                      </td>
                      <td className="py-2 text-right">
                        <MoneyDisplay value={row.b} compact />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <DiffBadge diff={row.diff} percentChange={row.percentChange} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="py-2 pr-2">Total</td>
                    <td className="py-2 text-right">
                      <MoneyDisplay value={totalA} compact />
                    </td>
                    <td className="py-2 text-right">
                      <MoneyDisplay value={totalB} compact />
                    </td>
                    <td
                      className={cn(
                        'tabular py-2 pl-3 text-right text-xs',
                        totalDiff > 0
                          ? 'text-exceeded'
                          : totalDiff < 0
                            ? 'text-safe'
                            : 'text-muted-foreground',
                      )}
                    >
                      {totalDiff > 0 ? '+' : ''}
                      <MoneyDisplay value={totalDiff} compact />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <ul className="space-y-2 lg:hidden">
              {rows.map((row) => (
                <li key={row.categoryId} className="rounded-xl border p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <DiffBadge diff={row.diff} percentChange={row.percentChange} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {labelA}: <MoneyDisplay value={row.a} compact className="text-foreground" />
                    </span>
                    <span>
                      {labelB}: <MoneyDisplay value={row.b} compact className="text-foreground" />
                    </span>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-xl border bg-muted/40 p-3 text-sm font-medium">
                <span>Total</span>
                <span className="flex items-center gap-3">
                  <MoneyDisplay value={totalA} compact />
                  <MoneyDisplay value={totalB} compact />
                  <span
                    className={cn(
                      'tabular text-xs',
                      totalDiff > 0
                        ? 'text-exceeded'
                        : totalDiff < 0
                          ? 'text-safe'
                          : 'text-muted-foreground',
                    )}
                  >
                    {totalDiff > 0 ? '+' : ''}
                    <MoneyDisplay value={totalDiff} compact />
                  </span>
                </span>
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
