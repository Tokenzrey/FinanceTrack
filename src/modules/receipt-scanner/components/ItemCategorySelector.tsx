'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { PILLAR_LABELS, type Category, type Pillar } from '@/shared/types/domain'

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

interface ItemCategorySelectorProps {
  value: string | null
  categories: Category[]
  onChange: (categoryId: string | null) => void
  ariaLabel: string
  className?: string
}

/** Category picker for one receipt line, grouped by pillar. */
export function ItemCategorySelector({
  value,
  categories,
  onChange,
  ariaLabel,
  className,
}: ItemCategorySelectorProps) {
  const active = categories.filter((c) => c.isActive && c.pillar !== 'income')

  return (
    <Select
      value={value ?? 'none'}
      onValueChange={(next) => onChange(next === 'none' ? null : next)}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder="Pilih kategori" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Belum dipilih —</SelectItem>
        {SPEND_PILLARS.map((pillar) => {
          const group = active.filter((c) => c.pillar === pillar)
          if (group.length === 0) return null
          return (
            <div key={pillar}>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {PILLAR_LABELS[pillar]}
              </p>
              {group.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </div>
          )
        })}
      </SelectContent>
    </Select>
  )
}
