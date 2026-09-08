'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { useDragSort, type DragSortResult } from '@/shared/hooks/useDragSort'
import { cn } from '@/shared/lib/utils'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { addChecklistItem } from '@/shared/use-cases/board/AddChecklistItem.usecase'
import { reorderChecklistItem } from '@/shared/use-cases/board/ReorderChecklistItem.usecase'
import { toggleChecklistItem } from '@/shared/use-cases/board/ToggleChecklistItem.usecase'

const CONTAINER_ID = 'task-checklist'

/**
 * Title + `n/m` (mono) + a 2px progress bar, then draggable items. Ticking the
 * last unchecked box surfaces a one-time "Tandai tugas selesai?" row — dismissed
 * on any interaction, not re-shown for the same open session.
 */
export function Checklist({ task, onMarkTaskDone }: { task: Task; onMarkTaskDone: () => void }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const items = useMemo(
    () => [...(task.checklist ?? [])].sort((a, b) => a.order - b.order),
    [task.checklist],
  )
  const doneCount = items.filter((c) => c.done).length
  const total = items.length

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [offerDone, setOfferDone] = useState(false)
  const [offerConsumed, setOfferConsumed] = useState(false)

  // Each task gets its own single offer — reset when a different task opens in the same mounted panel.
  useEffect(() => {
    setOfferDone(false)
    setOfferConsumed(false)
  }, [task.id])

  const onDrop = (r: DragSortResult) => {
    if (!uid || r.fromIndex === r.toIndex) return
    void reorderChecklistItem(uid, task, r.fromIndex, r.toIndex).catch(() =>
      toast.error('Gagal mengurutkan checklist.'),
    )
  }
  const { getItemProps, draggingIndex, announcement } = useDragSort({
    containerId: CONTAINER_ID,
    itemCount: total,
    onDrop,
  })

  const onToggle = (itemId: string, wasDone: boolean) => {
    if (!uid) return
    // Ticking the last unchecked box → gentle one-time offer.
    const willBeLastDone = !wasDone && doneCount === total - 1 && total > 0
    void toggleChecklistItem(uid, task, itemId).catch(() =>
      toast.error('Gagal memperbarui checklist.'),
    )
    if (willBeLastDone && !offerConsumed && task.status !== 'done') {
      setOfferDone(true)
    } else {
      setOfferDone(false)
    }
  }

  const dismissOffer = () => {
    setOfferDone(false)
    setOfferConsumed(true)
  }

  const submitAdd = () => {
    const title = draft.trim()
    setDraft('')
    setAdding(false)
    if (!title || !uid) return
    void addChecklistItem(uid, task, title).catch(() => toast.error('Gagal menambah item.'))
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold">Checklist</h3>
        {total > 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {doneCount}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div
          className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${doneCount} dari ${total} selesai`}
        >
          <span
            className="block h-full bg-foreground/40 transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }}
          />
        </div>
      )}

      <ul data-dragsort-container={CONTAINER_ID} className="space-y-0.5">
        {items.map((item, index) => {
          const drag = getItemProps(index)
          return (
            <li
              key={item.id}
              {...drag}
              className={cn(
                'flex items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                draggingIndex === index ? 'bg-muted' : 'hover:bg-muted/40',
              )}
            >
              <Checkbox
                checked={item.done}
                onCheckedChange={() => onToggle(item.id, item.done)}
                aria-label={item.title}
              />
              <span className={cn('min-w-0 flex-1', item.done && 'text-muted-foreground line-through')}>
                {item.title}
              </span>
            </li>
          )
        })}
      </ul>

      {offerDone && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm">
          <span className="text-muted-foreground">Tandai tugas selesai?</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => {
              dismissOffer()
              onMarkTaskDone()
            }}
          >
            Ya, tandai selesai
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={dismissOffer}>
            Nanti
          </Button>
        </div>
      )}

      {adding ? (
        <Input
          autoFocus
          value={draft}
          maxLength={200}
          placeholder="Item baru…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitAdd()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          onBlur={submitAdd}
          className="h-8"
          aria-label="Tambah item checklist"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-1.5 text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 size-3.5" aria-hidden />
          Tambah item
        </Button>
      )}

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </section>
  )
}
