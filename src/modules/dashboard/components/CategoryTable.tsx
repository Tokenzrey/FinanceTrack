'use client'

import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { AbsorptionBar } from '@/shared/components/finance/AbsorptionBar'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { StatusChip } from '@/shared/components/finance/StatusChip'
import { EmptyState } from '@/shared/components/finance/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { PILLAR_LABELS, type CategorySummary, type Pillar } from '@/shared/types/domain'
import { useBudgetStore } from '@/shared/stores/budget.store'

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

function BudgetCell({ summary }: { summary: CategorySummary }) {
  const overrideCategoryBudget = useBudgetStore((s) => s.overrideCategoryBudget)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(summary.budget)
  const [saving, setSaving] = useState(false)

  const commit = async () => {
    setSaving(true)
    try {
      // Same value as the computed budget means "no override" — clear it instead of pinning it.
      await overrideCategoryBudget(summary.category.id, draft === summary.budget ? null : draft)
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan anggaran')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(summary.budget)
          setEditing(true)
        }}
        className="group -mx-1 flex w-full items-center justify-end gap-1.5 rounded px-1 py-0.5 hover:bg-muted"
        aria-label={`Ubah anggaran ${summary.category.name}`}
      >
        <MoneyDisplay value={summary.budget} className="text-sm" />
        <Pencil
          className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <MoneyInput
        value={draft}
        onChange={setDraft}
        autoFocus
        className="h-8 text-xs"
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit()
          if (event.key === 'Escape') setEditing(false)
        }}
        onBlur={() => void commit()}
        disabled={saving}
      />
    </div>
  )
}

function CategoryRow({ summary }: { summary: CategorySummary }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="py-2.5 pr-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: summary.category.color }}
          />
          <span className="truncate text-sm font-medium">{summary.category.name}</span>
        </div>
      </td>
      <td className="tabular hidden py-2.5 text-right text-xs text-muted-foreground sm:table-cell">
        {formatPercent(summary.category.percentOfIncome, 1)}
      </td>
      <td className="py-2.5 text-right">
        <BudgetCell summary={summary} />
      </td>
      <td className="py-2.5 text-right">
        <MoneyDisplay value={summary.used} className="text-sm" />
      </td>
      <td className="hidden py-2.5 text-right md:table-cell">
        <MoneyDisplay value={summary.remaining} signed className="text-sm" />
      </td>
      <td className="min-w-[140px] py-2.5 pl-3">
        <AbsorptionBar rate={summary.absorptionRate} size="sm" />
      </td>
      <td className="hidden py-2.5 pl-3 lg:table-cell">
        <StatusChip status={summary.status} />
      </td>
    </tr>
  )
}

function PillarGroup({
  pillar,
  summaries,
  budget,
}: {
  pillar: Exclude<Pillar, 'income'>
  summaries: CategorySummary[]
  budget: number
}) {
  const [open, setOpen] = useState(true)
  const used = summaries.reduce((sum, s) => sum + s.used, 0)

  if (summaries.length === 0) return null

  return (
    <>
      <tr className="bg-muted/50">
        <td colSpan={7} className="px-0 py-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 px-1 py-2 text-left"
          >
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform', !open && '-rotate-90')}
              aria-hidden
            />
            <PillarColorDot pillar={pillar} />
            <span className="text-sm font-semibold">{PILLAR_LABELS[pillar]}</span>
            <span className="tabular ml-auto text-xs text-muted-foreground">
              {formatIDR(used)} / {formatIDR(budget)}
            </span>
          </button>
        </td>
      </tr>
      {open &&
        summaries.map((summary) => <CategoryRow key={summary.category.id} summary={summary} />)}
    </>
  )
}

interface CategoryTableProps {
  categories: CategorySummary[]
  pillarSummary: Record<Pillar, { budget: number; used: number }>
}

/**
 * The dashboard's table view — also the accessible fallback the chart palette's
 * sub-3:1 contrast requires: every number on the charts is readable here as text.
 */
export function CategoryTable({ categories, pillarSummary }: CategoryTableProps) {
  const spendCategories = categories.filter((c) => c.category.pillar !== 'income')

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base">Kategori</CardTitle>
      </CardHeader>
      <CardContent>
        {spendCategories.length === 0 ? (
          <EmptyState
            title="Belum ada kategori"
            description="Tambahkan kategori di Master Data untuk mulai menganggarkan."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <caption className="sr-only">
                Anggaran, pemakaian, dan serapan per kategori bulan ini
              </caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-2 text-left font-medium">
                    Nama
                  </th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">
                    %
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Anggaran
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Terpakai
                  </th>
                  <th scope="col" className="hidden py-2 text-right font-medium md:table-cell">
                    Sisa
                  </th>
                  <th scope="col" className="py-2 pl-3 text-left font-medium">
                    Serapan
                  </th>
                  <th scope="col" className="hidden py-2 pl-3 text-left font-medium lg:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {SPEND_PILLARS.map((pillar) => (
                  <PillarGroup
                    key={pillar}
                    pillar={pillar}
                    budget={pillarSummary[pillar].budget}
                    summaries={spendCategories.filter((c) => c.category.pillar === pillar)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
