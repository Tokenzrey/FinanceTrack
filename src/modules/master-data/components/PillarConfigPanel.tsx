'use client'

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PillarAllocationBar } from '@/shared/components/charts/PillarAllocationBar'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { cn } from '@/shared/lib/utils'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { DEFAULT_PILLAR_CONFIG, PILLAR_LABELS, type PillarConfig } from '@/shared/types/domain'

const PILLARS = ['needs', 'wants', 'savings'] as const

/**
 * Pillar split with a live Rupiah preview.
 *
 * Save is blocked unless the three add to exactly 100% — a plan that sums to 95%
 * silently under-budgets every pillar downstream.
 */
export function PillarConfigPanel() {
  const monthlyBudget = useBudgetStore((s) => s.monthlyBudget)
  const summary = useBudgetStore((s) => s.summary)
  const updatePillarConfig = useBudgetStore((s) => s.updatePillarConfig)

  const stored = monthlyBudget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG
  const [config, setConfig] = useState<PillarConfig>(stored)
  const [saving, setSaving] = useState(false)

  // Switching period loads a different budget; follow it.
  useEffect(() => {
    setConfig(stored)
  }, [stored.needs, stored.wants, stored.savings]) // eslint-disable-line react-hooks/exhaustive-deps

  const income = summary?.totalIncome ?? 0
  const total = config.needs + config.wants + config.savings
  const valid = Math.abs(total - 1) < 0.001
  const dirty =
    config.needs !== stored.needs ||
    config.wants !== stored.wants ||
    config.savings !== stored.savings

  const save = async () => {
    setSaving(true)
    try {
      await updatePillarConfig(config)
      toast.success('Komposisi pilar disimpan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan komposisi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">Komposisi pilar</CardTitle>
        <p className="text-xs text-muted-foreground">
          Bagian pemasukan untuk tiap pilar. Total harus tepat 100%.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="h-32">
          <PillarAllocationBar
            totalIncome={income}
            allocation={{
              needs: income * config.needs,
              wants: income * config.wants,
              savings: income * config.savings,
            }}
          />
        </div>

        {PILLARS.map((pillar) => (
          <div key={pillar} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <PillarColorDot pillar={pillar} />
                {PILLAR_LABELS[pillar]}
              </span>
              <span className="tabular text-muted-foreground">
                {formatPercent(config[pillar] * 100)} · {formatIDR(income * config[pillar])}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(config[pillar] * 100)}
              onChange={(event) =>
                setConfig({ ...config, [pillar]: Number(event.target.value) / 100 })
              }
              className="w-full accent-primary"
              aria-label={`Alokasi ${PILLAR_LABELS[pillar]}`}
            />
          </div>
        ))}

        <div
          className={cn(
            'rounded-xl border px-3 py-2 text-sm',
            valid
              ? 'border-safe/30 bg-safe/10 text-safe'
              : 'border-exceeded/30 bg-exceeded/10 text-exceeded',
          )}
        >
          Total alokasi: {formatPercent(total * 100)}
          {!valid && ' — harus tepat 100%'}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfig(DEFAULT_PILLAR_CONFIG)}
            className="gap-2"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            50/30/20
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!valid || !dirty || saving}
            className="ml-auto gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Simpan
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
