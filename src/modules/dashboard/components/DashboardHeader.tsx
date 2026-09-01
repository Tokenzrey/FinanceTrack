'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { formatMonthLong } from '@/shared/lib/format'
import { useBudgetStore } from '@/shared/stores/budget.store'

export function PeriodSelector() {
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const setActivePeriod = useBudgetStore((s) => s.setActivePeriod)

  const shift = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1)
    setActivePeriod(next.getFullYear(), next.getMonth() + 1)
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[9.5rem] text-center font-display text-sm font-semibold">
        {formatMonthLong(year, month)}
      </span>
      <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Bulan berikutnya">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

function IncomeEditor() {
  const summary = useBudgetStore((s) => s.summary)
  const updateIncome = useBudgetStore((s) => s.updateIncome)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(0)
  const [saving, setSaving] = useState(false)

  const income = summary?.totalIncome ?? 0

  const commit = async () => {
    setSaving(true)
    try {
      await updateIncome(draft)
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan pemasukan')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <MoneyInput
          value={draft}
          onChange={setDraft}
          autoFocus
          className="h-9 w-40"
          disabled={saving}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
        <Button size="sm" onClick={() => void commit()} disabled={saving}>
          {saving && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          Simpan
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(income)
        setEditing(true)
      }}
      className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted"
      aria-label="Ubah pemasukan bulan ini"
    >
      <span className="text-xs text-muted-foreground">Pemasukan</span>
      <MoneyDisplay value={income} className="text-sm font-semibold" />
      <Pencil
        className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  )
}

export function DashboardHeader() {
  const copyFromPrevious = useBudgetStore((s) => s.copyFromPrevious)
  const [copying, setCopying] = useState(false)

  const copy = async () => {
    setCopying(true)
    try {
      await copyFromPrevious()
      toast.success('Anggaran bulan lalu disalin')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyalin anggaran')
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PeriodSelector />
      <IncomeEditor />
      <Button
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        disabled={copying}
        className="ml-auto gap-2"
      >
        {copying ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
        Salin bulan lalu
      </Button>
    </div>
  )
}
