import type { Metadata } from 'next'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { formatIDR, formatMonthLong, formatPercent } from '@/shared/lib/format'
import { decodeSharedReport } from '@/shared/lib/share-report'
import { PILLAR_LABELS } from '@/shared/types/domain'

interface PageProps {
  searchParams: { d?: string | string[] }
}

function readPayload(searchParams: PageProps['searchParams']) {
  const raw = typeof searchParams.d === 'string' ? searchParams.d : undefined
  return raw ? decodeSharedReport(raw) : null
}

/**
 * Public, unauthenticated, no Firestore — everything needed to render lives in the `d`
 * query param itself (see `share-report.ts`). No auth check belongs here: the whole
 * point of a shareable link is that it works for whoever holds it, and it structurally
 * cannot expose anything beyond the aggregate numbers baked into the link at share time.
 */
export function generateMetadata({ searchParams }: PageProps): Metadata {
  const payload = readPayload(searchParams)
  return {
    title: payload
      ? `Laporan ${formatMonthLong(payload.year, payload.month)}`
      : 'Laporan tidak ditemukan',
  }
}

export default function SharedReportPage({ searchParams }: PageProps) {
  const payload = readPayload(searchParams)

  if (!payload) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Tautan laporan ini tidak valid atau rusak.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 py-10">
      <div className="space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Laporan keuangan · FinTrack
        </p>
        <h1 className="font-display text-2xl font-semibold">
          {formatMonthLong(payload.year, payload.month)}
        </h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Kpi label="Pemasukan" value={formatIDR(payload.totalIncome)} />
          <Kpi label="Terpakai" value={formatIDR(payload.totalUsed)} />
          <Kpi label="Ditabung" value={formatIDR(payload.totalSaved)} />
          <Kpi label="Rasio tabungan" value={formatPercent(payload.savingsRate)} />
        </CardContent>
      </Card>

      {payload.pillars.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Alokasi pilar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload.pillars.map((p) => (
              <PillarRow
                key={p.pillar}
                label={PILLAR_LABELS[p.pillar]}
                budget={p.budget}
                used={p.used}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {payload.categories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rincian kategori</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Kategori</th>
                  <th className="py-2 text-right font-medium">Anggaran</th>
                  <th className="py-2 text-right font-medium">Terpakai</th>
                </tr>
              </thead>
              <tbody>
                {payload.categories.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2">{c.name}</td>
                    <td className="tabular py-2 text-right">{formatIDR(c.budget)}</td>
                    <td className="tabular py-2 text-right">{formatIDR(c.used)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Ringkasan ini dibuat dari FinTrack. Tidak ada data pribadi lain (deskripsi transaksi,
        lokasi, atau data akun) yang ikut dibagikan.
      </p>
    </main>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  )
}

function PillarRow({ label, budget, used }: { label: string; budget: number; used: number }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular text-muted-foreground">
          {formatIDR(used)} / {formatIDR(budget)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
