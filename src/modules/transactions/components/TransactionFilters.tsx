'use client'

import { Filter, Search, X } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { cn } from '@/shared/lib/utils'
import {
  EMPTY_FILTERS,
  countActiveFilters,
  hasActiveFilters,
  type TransactionFilterState,
} from '@/shared/lib/transaction-filters'
import {
  PILLAR_LABELS,
  type Pillar,
  type SpendingMood,
  type TransactionType,
} from '@/shared/types/domain'
import { PAYMENT_METHODS } from './FormFields'

interface TransactionFiltersProps {
  filters: TransactionFilterState
  onChange: (filters: TransactionFilterState) => void
  availableTags: string[]
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'transfer', label: 'Transfer' },
]

const PILLARS: Pillar[] = ['needs', 'wants', 'savings', 'income']

const MOODS: { value: SpendingMood; label: string }[] = [
  { value: 'happy', label: 'Perlu' },
  { value: 'neutral', label: 'Oke' },
  { value: 'regret', label: 'Menyesal' },
]

/** Toggles one value in a multi-select array filter. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: { value: T; label: string }[]
  selected: T[]
  onToggle: (value: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TransactionFilters({ filters, onChange, availableTags }: TransactionFiltersProps) {
  const activeCount = countActiveFilters(filters)
  const active = hasActiveFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Cari keterangan, toko, tag…"
          className="pl-9"
          aria-label="Cari transaksi"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="size-4" aria-hidden />
            Filter
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 px-1.5">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70dvh] w-80 space-y-4 overflow-y-auto">
          <ChipGroup
            label="Jenis"
            options={TYPES}
            selected={filters.types}
            onToggle={(value) => onChange({ ...filters, types: toggle(filters.types, value) })}
          />

          <ChipGroup
            label="Pilar"
            options={PILLARS.map((p) => ({ value: p, label: PILLAR_LABELS[p] }))}
            selected={filters.pillars}
            onToggle={(value) => onChange({ ...filters, pillars: toggle(filters.pillars, value) })}
          />

          <ChipGroup
            label="Metode bayar"
            options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            selected={filters.paymentMethods}
            onToggle={(value) =>
              onChange({ ...filters, paymentMethods: toggle(filters.paymentMethods, value) })
            }
          />

          <ChipGroup
            label="Perasaan"
            options={MOODS}
            selected={filters.moods}
            onToggle={(value) => onChange({ ...filters, moods: toggle(filters.moods, value) })}
          />

          {availableTags.length > 0 && (
            <ChipGroup
              label="Tag"
              options={availableTags.map((tag) => ({ value: tag, label: tag }))}
              selected={filters.tags}
              onToggle={(value) => onChange({ ...filters, tags: toggle(filters.tags, value) })}
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-from" className="text-xs">
                Dari tanggal
              </Label>
              <Input
                id="filter-from"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-to" className="text-xs">
                Sampai
              </Label>
              <Input
                id="filter-to"
                type="date"
                value={filters.dateTo}
                onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-min" className="text-xs">
                Nominal min
              </Label>
              <MoneyInput
                id="filter-min"
                value={filters.minAmount ?? 0}
                onChange={(value) => onChange({ ...filters, minAmount: value || null })}
                numpad={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-max" className="text-xs">
                Nominal maks
              </Label>
              <MoneyInput
                id="filter-max"
                value={filters.maxAmount ?? 0}
                onChange={(value) => onChange({ ...filters, maxAmount: value || null })}
                numpad={false}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {active && (
        <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} className="gap-1.5">
          <X className="size-4" aria-hidden />
          Reset
        </Button>
      )}
    </div>
  )
}
