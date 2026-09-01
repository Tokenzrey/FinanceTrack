'use client'

import { useState } from 'react'
import { AlertTriangle, Frown, Globe, Meh, Smile, Sparkles, Store } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { AbsorptionBar } from '@/shared/components/finance/AbsorptionBar'
import { ChartContainer } from '@/shared/components/charts/ChartContainer'
import { GaugeChart } from '@/shared/components/charts/GaugeChart'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import { PAYMENT_METHODS } from '@/modules/transactions/components/FormFields'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { realSavingsGap, simulateCut } from '@/shared/lib/analytics'
import type { BudgetEfficiency } from '@/shared/lib/analytics'
import { cn } from '@/shared/lib/utils'
import { HealthRadar, PillarDonut, SpendingTreemap } from './components/AnalyticsCharts'
import { useAnalyticsData } from './useAnalyticsData'

const MOOD_META = {
  happy: { label: 'Perlu', icon: Smile, className: 'text-safe' },
  neutral: { label: 'Oke', icon: Meh, className: 'text-warning' },
  regret: { label: 'Menyesal', icon: Frown, className: 'text-exceeded' },
  unset: { label: 'Tanpa label', icon: Meh, className: 'text-muted-foreground' },
} as const

function MarketPulsePanel({ market }: { market: ReturnType<typeof useAnalyticsData>['market'] }) {
  if (!market) return null

  const quotes = [market.forex, market.gold, market.biRate, market.inflation, market.sbn].filter(
    Boolean,
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4" aria-hidden />
          Market Pulse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quotes.map((quote) => {
            const isPercent = quote!.unit.includes('%')
            return (
              <li key={quote!.label} className="rounded-xl border p-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{quote!.label}</p>
                  {!quote!.live && (
                    <Badge variant="outline" className="px-1 py-0 text-[10px]">
                      manual
                    </Badge>
                  )}
                </div>
                <p className="tabular font-display text-lg font-bold">
                  {isPercent ? formatPercent(quote!.value, 2) : formatIDR(quote!.value)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {!isPercent ? `${quote!.unit} · ` : ''}
                  {quote!.source}
                  {quote!.asOf ? ` · per ${quote!.asOf}` : ''}
                </p>
              </li>
            )
          })}
        </ul>

        {market.errors.length > 0 && (
          <p className="text-xs text-muted-foreground">{market.errors.join(' ')}</p>
        )}

        <p className="text-xs text-muted-foreground">
          BI Rate, inflasi, dan SBN adalah nilai referensi yang dipelihara manual — API resmi
          Bank Indonesia tidak dapat diakses publik, BPS memerlukan kunci developer terdaftar,
          dan DJPPR tidak menyediakan API publik. Bisa diperbarui lewat env var tanpa ubah kode.
        </p>
      </CardContent>
    </Card>
  )
}

const EFFICIENCY_COLOR: Record<BudgetEfficiency['status'], string> = {
  over: '#EF4444',
  under: '#EAB308',
  efficient: '#22C55E',
}

const EFFICIENCY_LABEL: Record<BudgetEfficiency['status'], string> = {
  over: 'Boros',
  under: 'Kurang terpakai',
  efficient: 'Efisien',
}

/** Per-category gauges: how closely spending matched its budget, not just under/over. */
function BudgetEfficiencyPanel({ rows }: { rows: BudgetEfficiency[] }) {
  // Worst five first — that is what is worth a user's attention.
  const shown = rows.slice(0, 6)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Skor efisiensi anggaran</CardTitle>
        <p className="text-xs text-muted-foreground">
          100 berarti terpakai persis sesuai anggaran — boros dan menganggur sama-sama
          menurunkan skor.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {shown.map((row) => (
            <div key={row.categoryId} className="flex flex-col items-center gap-1 text-center">
              <GaugeChart value={row.score} color={EFFICIENCY_COLOR[row.status]} size={84} />
              <p className="truncate text-xs font-medium">{row.name}</p>
              <p className="text-[10px] text-muted-foreground">{EFFICIENCY_LABEL[row.status]}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function WhatIfSimulator({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof useAnalyticsData>['summary']>
}) {
  const spendCategories = summary.categories.filter(
    (row) => row.category.pillar !== 'income' && row.used > 0,
  )

  const [categoryId, setCategoryId] = useState(spendCategories[0]?.category.id ?? '')
  const [cut, setCut] = useState(20)

  if (spendCategories.length === 0) return null

  const result = simulateCut(summary.categories, categoryId, cut)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" aria-hidden />
          Simulasi &ldquo;bagaimana jika&rdquo;
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Jika saya potong</span>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44" aria-label="Kategori simulasi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spendCategories.map((row) => (
                <SelectItem key={row.category.id} value={row.category.id}>
                  {row.category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">sebanyak {formatPercent(cut)}</span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={cut}
          onChange={(event) => setCut(Number(event.target.value))}
          className="w-full accent-primary"
          aria-label="Persentase pemotongan"
        />

        {result && (
          <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
            <p>
              Hemat <MoneyDisplay value={result.monthlySaving} className="font-semibold" /> per
              bulan
            </p>
            <p className="text-xs text-muted-foreground">
              Setara{' '}
              <MoneyDisplay value={result.yearlySaving} className="font-medium text-foreground" />{' '}
              dalam setahun. Pengeluaran {result.categoryName} turun dari{' '}
              {formatIDR(result.currentSpend)} ke {formatIDR(result.newSpend)}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const data = useAnalyticsData()
  const { summary, market, loading } = data

  if (loading && !summary) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingSkeleton rows={6} />
        </CardContent>
      </Card>
    )
  }

  if (!summary || summary.categories.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Analitik" actions={<PeriodSelector />} />
        <EmptyState
          title="Belum ada data untuk dianalisis"
          description="Catat transaksi dan atur kategori dulu."
        />
      </div>
    )
  }

  const inflation = market?.inflation.value ?? 0
  const gap = realSavingsGap(summary.savingsRate, inflation)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analitik"
        description="Pola pengeluaran, kesehatan keuangan, dan kondisi pasar."
        actions={<PeriodSelector />}
      />

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Ringkasan</TabsTrigger>
          <TabsTrigger value="spending">Belanja</TabsTrigger>
          <TabsTrigger value="savings">Tabungan</TabsTrigger>
          <TabsTrigger value="market">Pasar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-xs font-medium text-muted-foreground">Skor kesehatan keuangan</p>
                <p className="font-display text-4xl font-bold">{data.health.total}</p>
                <AbsorptionBar rate={data.health.total} showLabel={false} />
                <p className="text-xs text-muted-foreground">
                  Gabungan rasio tabungan, disiplin anggaran, dana darurat, beban utang, konsistensi
                  mencatat, dan kepuasan belanja.
                </p>
              </CardContent>
            </Card>

            <ChartContainer title="Rincian skor" description="Enam komponen penilaian" height={260}>
              <HealthRadar breakdown={data.health.breakdown} />
            </ChartContainer>
          </div>

          {data.alerts.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-warning" aria-hidden />
                  Laju melebihi anggaran ({data.alerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.alerts.slice(0, 5).map((row) => (
                    <li key={row.category.id} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{row.category.name}</span>
                      <span className="text-xs text-muted-foreground">
                        proyeksi{' '}
                        <MoneyDisplay
                          value={row.projectedMonthEnd}
                          compact
                          className="text-foreground"
                        />
                        {' vs '}
                        <MoneyDisplay value={row.budget} compact className="text-foreground" />
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {data.efficiency.length > 0 && <BudgetEfficiencyPanel rows={data.efficiency} />}

          <WhatIfSimulator summary={summary} />
        </TabsContent>

        <TabsContent value="spending" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartContainer
              title="Peta pengeluaran"
              description="Ukuran mengikuti nominal"
              height={280}
            >
              <SpendingTreemap data={data.treemap} />
            </ChartContainer>

            <ChartContainer title="Porsi per pilar" height={280}>
              <PillarDonut summaries={summary.categories} />
            </ChartContainer>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="size-4" aria-hidden />
                  Merchant teratas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Isi kolom toko saat mencatat transaksi untuk melihat pola ini.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.merchants.map((merchant) => (
                      <li key={merchant.name} className="flex items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{merchant.name}</span>
                        <span className="text-xs text-muted-foreground">{merchant.count}x</span>
                        <MoneyDisplay value={merchant.total} compact className="font-medium" />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Metode pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.methods.map((row) => {
                    const meta = PAYMENT_METHODS.find((m) => m.value === row.method)
                    return (
                      <li key={row.method} className="space-y-1">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            {meta?.label ?? 'Tidak dicatat'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatPercent(row.percent)}
                          </span>
                          <MoneyDisplay value={row.total} compact className="font-medium" />
                        </div>
                        <AbsorptionBar rate={row.percent} showLabel={false} size="sm" />
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Perasaan atas pengeluaran</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2">
                  {data.moods.map((bucket) => {
                    const meta = MOOD_META[bucket.mood]
                    const Icon = meta.icon
                    return (
                      <li key={bucket.mood} className="flex items-center gap-3 text-sm">
                        <Icon className={cn('size-4 shrink-0', meta.className)} aria-hidden />
                        <span className="min-w-0 flex-1">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{bucket.count}x</span>
                        <MoneyDisplay value={bucket.total} compact className="font-medium" />
                      </li>
                    )
                  })}
                </ul>
                {data.regret > 0 && (
                  <p className="rounded-xl border border-exceeded/30 bg-exceeded/5 p-3 text-xs text-exceeded">
                    <MoneyDisplay value={data.regret} className="font-semibold" /> ditandai sebagai
                    pengeluaran yang disesali bulan ini.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tag terbesar</CardTitle>
              </CardHeader>
              <CardContent>
                {data.tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada transaksi bertag.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.tags.slice(0, 20).map((row, index) => (
                      <span
                        key={row.tag}
                        className="rounded-lg bg-muted px-2 py-1"
                        // Bigger tags read as bigger spend; the amount is in the title too.
                        style={{ fontSize: `${Math.max(11, 17 - index)}px` }}
                        title={`${row.tag}: ${formatIDR(row.total)}`}
                      >
                        {row.tag}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="savings" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">Rasio tabungan</p>
                <p className="font-display text-2xl font-bold">
                  {formatPercent(summary.savingsRate)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">Kas likuid</p>
                <MoneyDisplay
                  value={data.liquid}
                  compact
                  className="block font-display text-2xl font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs font-medium text-muted-foreground">Dana darurat</p>
                <p className="font-display text-2xl font-bold">
                  {formatPercent(data.emergencyProgress)}
                </p>
                <p className="text-xs text-muted-foreground">Target 3x pengeluaran bulanan</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tabungan vs inflasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                Rasio tabungan <strong>{formatPercent(summary.savingsRate)}</strong> dibanding
                inflasi <strong>{formatPercent(inflation, 2)}</strong>.
              </p>
              <p
                className={cn(
                  'rounded-xl border p-3 text-sm',
                  gap >= 0
                    ? 'border-safe/30 bg-safe/10 text-safe'
                    : 'border-exceeded/30 bg-exceeded/10 text-exceeded',
                )}
              >
                {gap >= 0
                  ? `Tabunganmu unggul ${formatPercent(gap)} di atas inflasi.`
                  : `Tabunganmu tertinggal ${formatPercent(Math.abs(gap))} dari inflasi.`}
              </p>
              <p className="text-xs text-muted-foreground">
                Perbandingan kasar: rasio tabungan bulanan versus inflasi tahunan, memakai angka
                inflasi referensi yang dapat kamu sesuaikan.
              </p>
            </CardContent>
          </Card>

          {data.dti > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Beban utang</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-display text-2xl font-bold">{formatPercent(data.dti)}</p>
                <AbsorptionBar rate={(data.dti / 40) * 100} showLabel={false} />
                <p className="text-xs text-muted-foreground">
                  Rasio cicilan terhadap pemasukan. Di atas 30% umumnya dianggap berisiko.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="market" className="mt-4 space-y-4">
          <MarketPulsePanel market={market} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
