'use client'

import { useMemo } from 'react'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { PILLAR_LABELS, type Pillar } from '@/shared/types/domain'
import { useMasterDataStore } from '@/shared/stores/master-data.store'

interface CategoryCascaderProps {
  pillar: Pillar | ''
  categoryId: string
  categoryItemId: string
  onChange: (value: { pillar: Pillar | ''; categoryId: string; categoryItemId: string }) => void
  /** Income transactions pick from income categories only, and vice versa. */
  incomeMode?: boolean
}

/**
 * Pillar → Category → Item.
 *
 * Changing a level clears the levels below it: keeping a stale category after switching
 * pillar would silently file the transaction under the wrong pillar.
 */
export function CategoryCascader({
  pillar,
  categoryId,
  categoryItemId,
  onChange,
  incomeMode = false,
}: CategoryCascaderProps) {
  const categories = useMasterDataStore((s) => s.categories)
  const categoryItems = useMasterDataStore((s) => s.categoryItems)

  const pillars: Pillar[] = incomeMode ? ['income'] : ['needs', 'wants', 'savings']

  const availableCategories = useMemo(
    () => categories.filter((c) => c.isActive && c.pillar === pillar),
    [categories, pillar],
  )

  const availableItems = useMemo(
    () => (categoryId ? (categoryItems[categoryId] ?? []).filter((i) => i.isActive) : []),
    [categoryItems, categoryId],
  )

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="tx-pillar" className="text-xs">
          Pilar
        </Label>
        <Select
          value={pillar}
          onValueChange={(value) =>
            onChange({ pillar: value as Pillar, categoryId: '', categoryItemId: '' })
          }
        >
          <SelectTrigger id="tx-pillar">
            <SelectValue placeholder="Pilih pilar" />
          </SelectTrigger>
          <SelectContent>
            {pillars.map((p) => (
              <SelectItem key={p} value={p}>
                <span className="flex items-center gap-2">
                  <PillarColorDot pillar={p} />
                  {PILLAR_LABELS[p]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-category" className="text-xs">
          Kategori
        </Label>
        <Select
          value={categoryId}
          disabled={!pillar}
          onValueChange={(value) => onChange({ pillar, categoryId: value, categoryItemId: '' })}
        >
          <SelectTrigger id="tx-category">
            <SelectValue placeholder={pillar ? 'Pilih kategori' : 'Pilih pilar dulu'} />
          </SelectTrigger>
          <SelectContent>
            {availableCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-item" className="text-xs">
          Item <span className="text-muted-foreground">(opsional)</span>
        </Label>
        <Select
          value={categoryItemId || 'none'}
          disabled={availableItems.length === 0}
          onValueChange={(value) =>
            onChange({ pillar, categoryId, categoryItemId: value === 'none' ? '' : value })
          }
        >
          <SelectTrigger id="tx-item">
            <SelectValue placeholder={availableItems.length ? 'Pilih item' : 'Tidak ada item'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Tanpa item —</SelectItem>
            {availableItems.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
