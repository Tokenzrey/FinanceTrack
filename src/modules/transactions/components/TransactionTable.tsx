'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Copy, MoreHorizontal, Pencil, Receipt, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import type { ReceiptRef } from '@/shared/components/finance/ReceiptViewerDialog'
import { cn } from '@/shared/lib/utils'
import { formatDay } from '@/shared/lib/format'
import type { Category, Transaction } from '@/shared/types/domain'
import { PAYMENT_METHODS } from './FormFields'

interface TransactionTableProps {
  transactions: Transaction[]
  categories: Category[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onEdit: (tx: Transaction) => void
  onDuplicate: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
  onViewReceipt: (receipt: ReceiptRef) => void
}

/** A transaction carries a viewable receipt if either the new Drive field or the legacy URL is set. */
function hasReceipt(tx: Transaction): boolean {
  return Boolean(tx.gDriveFileId || tx.receiptUrl)
}

const ROW_HEIGHT = 52

/**
 * Desktop table. Rows are virtualized so a month with thousands of transactions
 * still scrolls at 60fps — only the visible window is in the DOM.
 */
export function TransactionTable({
  transactions,
  categories,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onDuplicate,
  onDelete,
  onViewReceipt,
}: TransactionTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const allSelected = transactions.length > 0 && selectedIds.length === transactions.length

  return (
    <div className="hidden rounded-2xl border lg:block">
      <div className="grid grid-cols-[36px_100px_minmax(0,1.4fr)_minmax(0,1fr)_110px_120px_44px] items-center gap-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleAll}
          aria-label="Pilih semua transaksi"
        />
        <span>Tanggal</span>
        <span>Keterangan</span>
        <span>Kategori</span>
        <span>Metode</span>
        <span className="text-right">Jumlah</span>
        <span className="sr-only">Aksi</span>
      </div>

      <div ref={scrollRef} className="max-h-[60vh] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const tx = transactions[virtualRow.index]
            const category = categoryById.get(tx.categoryId)
            const method = PAYMENT_METHODS.find((m) => m.value === tx.paymentMethod)
            const selected = selectedIds.includes(tx.id)

            return (
              <div
                key={tx.id}
                className={cn(
                  'absolute inset-x-0 grid grid-cols-[36px_100px_minmax(0,1.4fr)_minmax(0,1fr)_110px_120px_44px] items-center gap-3 border-b px-3 hover:bg-muted/40',
                  selected && 'bg-primary/5',
                )}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(tx.id)}
                  aria-label={`Pilih transaksi ${tx.description ?? formatDay(tx.date.toDate())}`}
                />

                <span className="tabular text-xs text-muted-foreground">
                  {formatDay(tx.date.toDate())}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {tx.description || category?.name || 'Tanpa keterangan'}
                  </p>
                  {tx.location && (
                    <p className="truncate text-xs text-muted-foreground">{tx.location}</p>
                  )}
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <PillarColorDot pillar={tx.pillar} />
                  <span className="truncate text-xs">{category?.name ?? '—'}</span>
                </div>

                <span className="truncate text-xs text-muted-foreground">
                  {method?.label ?? '—'}
                </span>

                <MoneyDisplay
                  value={tx.type === 'income' ? tx.amount : -tx.amount}
                  signed
                  className="text-right text-sm font-medium"
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Aksi transaksi"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(tx)}>
                      <Pencil className="mr-2 size-4" aria-hidden />
                      Ubah
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(tx)}>
                      <Copy className="mr-2 size-4" aria-hidden />
                      Duplikat
                    </DropdownMenuItem>
                    {hasReceipt(tx) && (
                      <DropdownMenuItem
                        onClick={() =>
                          onViewReceipt({
                            gDriveFileId: tx.gDriveFileId,
                            legacyUrl: tx.gDriveFileId ? undefined : tx.receiptUrl,
                            driveViewLink: tx.gDriveWebViewLink,
                          })
                        }
                      >
                        <Receipt className="mr-2 size-4" aria-hidden />
                        Lihat struk
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(tx)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" aria-hidden />
                      Hapus
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
