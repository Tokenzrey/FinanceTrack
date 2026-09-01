'use client'

import { AlertTriangle, CheckCircle2, PiggyBank, TrendingUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Card, CardContent } from '@/shared/components/ui/card'
import { AbsorptionBar } from '@/shared/components/finance/AbsorptionBar'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { cn } from '@/shared/lib/utils'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { DTI_DANGER } from '@/shared/lib/affordability'
import { FINANCING_LABELS, type Wishlist } from '@/shared/types/wishlist.types'

export const DECISION_STYLE = {
  'Aman Dibeli': {
    className: 'text-safe border-safe/40 bg-safe/10',
    icon: CheckCircle2,
  },
  'Gunakan Tabungan': {
    className: 'text-warning border-warning/40 bg-warning/10',
    icon: PiggyBank,
  },
  'Tunda (Risiko Tinggi)': {
    className: 'text-exceeded border-exceeded/40 bg-exceeded/10',
    icon: AlertTriangle,
  },
} as const

function Metric({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="text-sm font-semibold">{children}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/** Breaks the engine's recommendation down into the numbers it came from. */
export function AffordabilityDetail({
  item,
  onOpenChange,
}: {
  item: Wishlist | null
  onOpenChange: (open: boolean) => void
}) {
  if (!item?.affordabilityAnalytics) return null

  const { decision, recommendationScore, metrics, insights } = item.affordabilityAnalytics
  const style = DECISION_STYLE[decision]
  const Icon = style.icon
  const emergency = metrics.emergencyFundImpact

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {formatIDR(item.estimatedPrice)} · {FINANCING_LABELS[item.financingMethod]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={cn('flex items-center gap-3 rounded-2xl border p-4', style.className)}>
            <Icon className="size-6 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{decision}</p>
              <p className="text-xs opacity-90">Skor rekomendasi {recommendationScore}/100</p>
            </div>
          </div>

          <AbsorptionBar rate={recommendationScore} showLabel={false} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Porsi sisa anggaran" hint="Harga dibanding sisa anggaran bulan ini">
              {formatPercent(metrics.percentOfRemainingBudget)}
            </Metric>

            <Metric
              label="Rasio utang setelah beli"
              hint={`Batas aman ${formatPercent(DTI_DANGER)}`}
            >
              <span
                className={cn(
                  metrics.postPurchaseDebtRatio > DTI_DANGER ? 'text-exceeded' : 'text-safe',
                )}
              >
                {formatPercent(metrics.postPurchaseDebtRatio)}
              </span>
            </Metric>

            <Metric
              label="Dana likuid setelah beli"
              hint={`Sebelumnya ${formatIDR(emergency.beforePurchase)}`}
            >
              <span className="flex items-center gap-2">
                <MoneyDisplay value={emergency.afterPurchase} signed />
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-xs',
                    emergency.status === 'Aman'
                      ? 'border-safe/40 text-safe'
                      : 'border-exceeded/40 text-exceeded',
                  )}
                >
                  {emergency.status}
                </span>
              </span>
            </Metric>

            <Metric label="Jika diinvestasikan 5 tahun" hint="Asumsi SBN 6% per tahun">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="size-4 text-savings" aria-hidden />
                <MoneyDisplay value={metrics.opportunityCost5Years} />
              </span>
            </Metric>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Analisis</p>
            <ul className="space-y-1.5">
              {insights.map((line) => (
                <li key={line} className="flex gap-2 text-xs text-muted-foreground">
                  <span aria-hidden>•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Perhitungan memakai aset likuid, cicilan berjalan, dan anggaran bulan aktif yang
            tercatat di aplikasi. Semakin lengkap data Kekayaan Bersih, semakin akurat hasilnya.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
