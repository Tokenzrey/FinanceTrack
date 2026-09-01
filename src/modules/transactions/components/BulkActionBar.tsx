'use client'

import { Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'

interface BulkActionBarProps {
  count: number
  total: number
  onClear: () => void
  onDelete: () => void
  deleting: boolean
}

/** Sticky bar shown only while rows are selected. */
export function BulkActionBar({ count, total, onClear, onDelete, deleting }: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div
      role="region"
      aria-label="Aksi massal"
      className="glass sticky bottom-20 z-30 flex items-center gap-3 rounded-2xl border p-3 shadow-lg lg:bottom-4"
    >
      <Button variant="ghost" size="icon" onClick={onClear} aria-label="Batalkan pilihan">
        <X className="size-4" />
      </Button>

      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{count} transaksi dipilih</p>
        <MoneyDisplay value={total} className="text-xs text-muted-foreground" />
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={deleting}
        className="gap-2"
      >
        {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Hapus
      </Button>
    </div>
  )
}
