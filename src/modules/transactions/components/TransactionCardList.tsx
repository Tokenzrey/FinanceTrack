'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { cn } from '@/shared/lib/utils'
import { formatDay } from '@/shared/lib/format'
import type { Category, Transaction } from '@/shared/types/domain'

interface TransactionCardListProps {
  transactions: Transaction[]
  categories: Category[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
  selectionMode: boolean
}

/** Drag further left than this and releasing deletes the row. */
const DELETE_THRESHOLD = -96

function SwipeableCard({
  tx,
  category,
  selected,
  selectionMode,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  category?: Category
  selected: boolean
  selectionMode: boolean
  onToggleSelect: (id: string) => void
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}) {
  const x = useMotionValue(0)
  // The red backdrop fades in as the row is dragged, so intent is visible before release.
  const backdropOpacity = useTransform(x, [DELETE_THRESHOLD, 0], [1, 0])

  return (
    <li className="relative overflow-hidden rounded-2xl border">
      <motion.div
        aria-hidden
        style={{ opacity: backdropOpacity }}
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-exceeded"
      >
        <Trash2 className="size-5 text-white" />
      </motion.div>

      <motion.div
        drag={selectionMode ? false : 'x'}
        dragConstraints={{ left: DELETE_THRESHOLD, right: 0 }}
        dragElastic={0.05}
        style={{ x }}
        onDragEnd={(_, info) => {
          if (info.offset.x <= DELETE_THRESHOLD) onDelete(tx)
          else x.set(0)
        }}
        className="relative flex items-center gap-3 bg-card p-3"
      >
        {selectionMode && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(tx.id)}
            aria-label="Pilih transaksi"
          />
        )}

        <button
          type="button"
          onClick={() => (selectionMode ? onToggleSelect(tx.id) : onEdit(tx))}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <PillarColorDot pillar={tx.pillar} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {tx.description || category?.name || 'Tanpa keterangan'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDay(tx.date.toDate())}
              {category ? ` · ${category.name}` : ''}
              {tx.location ? ` · ${tx.location}` : ''}
            </p>
          </div>
          <MoneyDisplay
            value={tx.type === 'income' ? tx.amount : -tx.amount}
            signed
            className="shrink-0 text-sm font-medium"
          />
        </button>
      </motion.div>
    </li>
  )
}

/** Mobile list. Swipe a row left to delete; the caller shows an undo toast. */
export function TransactionCardList({
  transactions,
  categories,
  selectedIds,
  onToggleSelect,
  onEdit,
  onDelete,
  selectionMode,
}: TransactionCardListProps) {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const [hint, setHint] = useState(true)

  return (
    <div className="space-y-2 lg:hidden">
      {hint && transactions.length > 0 && (
        <button
          type="button"
          onClick={() => setHint(false)}
          className="w-full rounded-xl bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground"
        >
          Geser kartu ke kiri untuk menghapus. Ketuk untuk menutup petunjuk ini.
        </button>
      )}

      <ul className={cn('space-y-2')}>
        {transactions.map((tx) => (
          <SwipeableCard
            key={tx.id}
            tx={tx}
            category={categoryById.get(tx.categoryId)}
            selected={selectedIds.includes(tx.id)}
            selectionMode={selectionMode}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  )
}
