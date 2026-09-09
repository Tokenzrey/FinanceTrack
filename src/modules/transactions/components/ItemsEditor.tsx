'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import type { TransactionItem } from '@/shared/types/domain'

/**
 * Editable line-item list for a transaction. Rows are Nama / Qty / Harga (line total,
 * not unit price). Kept as a controlled component — the parent owns the array and the
 * grand-total math, this just renders and edits.
 */
export function ItemsEditor({
  items,
  onChange,
}: {
  items: TransactionItem[]
  onChange: (items: TransactionItem[]) => void
}) {
  const setRow = (index: number, patch: Partial<TransactionItem>) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  const addRow = () => onChange([...items, { name: '', qty: 1, price: 0 }])
  const removeRow = (index: number) => onChange(items.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Rincian item</Label>
        <span className="text-xs text-muted-foreground">{items.length} baris</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_3.5rem_7rem_1.75rem] gap-2 px-1 text-[11px] text-muted-foreground">
            <span>Nama</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Harga</span>
            <span />
          </div>
          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_3.5rem_7rem_1.75rem] items-center gap-2"
            >
              <Input
                value={item.name}
                onChange={(e) => setRow(index, { name: e.target.value })}
                placeholder="Nama item"
                className="h-8 text-sm"
              />
              <Input
                value={String(item.qty)}
                onChange={(e) =>
                  setRow(index, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                }
                inputMode="numeric"
                className="h-8 px-1 text-center text-sm"
              />
              <MoneyInput
                value={item.price}
                onChange={(v) => setRow(index, { price: v })}
                numpad={false}
                className="h-8 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label={`Hapus baris ${index + 1}`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="mr-1.5 size-4" aria-hidden />
        Tambah baris
      </Button>
    </div>
  )
}
