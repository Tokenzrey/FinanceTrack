'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsLeftRight, Plus } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useDragSort, type DragSortResult } from '@/shared/hooks/useDragSort'
import { cn } from '@/shared/lib/utils'
import type { BoardList, Label } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'
import { ColumnMenu } from './ColumnMenu'
import { TaskCard } from './TaskCard'

interface BoardColumnProps {
  list: BoardList
  lists: BoardList[]
  /** This column's tasks — already filtered and sorted by `order` ascending. */
  cards: Task[]
  tz: string
  labelsById: Map<string, Label>
  /** Ids of tasks whose every blocker is done — cards not in it show a quiet marker. */
  readySet?: Set<string>
  compact: boolean
  /** Store `draggingId` — non-null means a card lift is in progress somewhere. */
  draggingId: string | null
  /** Registers/unregisters this column's scroll body so sibling columns can hit-test it. */
  registerBody: (listId: string, el: HTMLElement | null) => void
  /** Card rects for an arbitrary column id (cross-column drop resolution). */
  getContainerItems: (id: string) => { containerId: string; rects: DOMRect[] } | null
  /** A card was dropped — indices + source/target column ids. */
  onCardDrop: (r: DragSortResult) => void
  /** Inline "+ Tambah tugas" for this column. */
  onInlineAdd: (listId: string, title: string) => void
  /** Expand a collapsed column — the collapsed bar is the only affordance. */
  onExpand: (listId: string) => void
  onOpenTask?: (task: Task) => void
}

export function BoardColumn({
  list,
  lists,
  cards,
  tz,
  labelsById,
  readySet,
  compact,
  draggingId,
  registerBody,
  getContainerItems,
  onCardDrop,
  onInlineAdd,
  onExpand,
  onOpenTask,
}: BoardColumnProps) {
  const bodyRef = useRef<HTMLElement | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    registerBody(list.id, bodyRef.current)
    return () => registerBody(list.id, null)
  }, [list.id, registerBody])

  const { getItemProps, draggingIndex, dragProxy } = useDragSort({
    containerId: list.id,
    itemCount: cards.length,
    onDrop: onCardDrop,
    getContainerItems,
  })

  const labelsFor = useCallback(
    (ids?: string[]) => (ids ?? []).map((id) => labelsById.get(id)).filter((l): l is Label => !!l),
    [labelsById],
  )

  const submitAdd = () => {
    const title = draft.trim()
    if (title) onInlineAdd(list.id, title)
    setDraft('')
    setAdding(false)
  }

  const count = cards.length
  const overWip = list.wipLimit != null && count > list.wipLimit
  const isDropTarget = draggingId != null

  if (list.isCollapsed) {
    // The whole bar is the expand affordance. Rendering `ColumnMenu` here instead
    // would hide "Buka" behind a 44px-wide dropdown trigger; worse, an earlier
    // revision rendered neither and the column became a one-way trip.
    return (
      <button
        type="button"
        ref={bodyRef as React.RefObject<HTMLButtonElement>}
        data-dragsort-container={list.id}
        onClick={() => onExpand(list.id)}
        aria-label={`Buka kolom ${list.title}`}
        title={`Buka kolom ${list.title}`}
        className={cn(
          'group flex h-full w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-border/50 bg-muted/60 py-3',
          'transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring motion-reduce:transition-none',
        )}
      >
        <ChevronsLeftRight
          className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground motion-reduce:transition-none"
          aria-hidden
        />
        <span className="[writing-mode:vertical-rl] font-display text-[13px] font-semibold uppercase tracking-wide">
          {list.title}
        </span>
        <span className={cn('font-mono text-xs', overWip ? 'text-destructive' : 'text-muted-foreground')}>
          {count}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border/50 bg-muted/60">
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl bg-muted/60 px-3 py-2.5 backdrop-blur">
        <h3 className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold uppercase tracking-wide">
          {list.title}
        </h3>
        <span
          className={cn('font-mono text-xs', overWip ? 'text-destructive' : 'text-muted-foreground')}
        >
          {count}
          {list.wipLimit != null && `/${list.wipLimit}`}
        </span>
        <ColumnMenu list={list} lists={lists} onAddTask={() => setAdding(true)} />
      </div>

      <div
        ref={bodyRef as React.RefObject<HTMLDivElement>}
        data-dragsort-container={list.id}
        className={cn(
          'scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2',
          'transition-colors duration-200 motion-reduce:transition-none',
          isDropTarget && 'bg-primary/[0.03] ring-2 ring-inset ring-ring',
        )}
      >
        {cards.map((task, index) => {
          const lifted = draggingIndex === index
          // The lifted card leaves a same-height dashed gap and the clone (rendered
          // in a portal by `BoardView`) follows the pointer. Keeping the card
          // mounted-but-hidden preserves `ownRects()`'s indexing in `useDragSort`.
          return (
            <div key={task.id} className="relative">
              {lifted && dragProxy && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-in fade-in rounded-lg border border-dashed border-border bg-muted/30 duration-200 motion-reduce:animate-none"
                />
              )}
              <div className={cn(lifted && 'invisible')}>
                <TaskCard
                  task={task}
                  tz={tz}
                  labels={labelsFor(task.labelIds)}
                  ready={readySet ? readySet.has(task.id) : true}
                  compact={compact}
                  dragging={lifted}
                  onOpen={onOpenTask}
                  dragProps={getItemProps(index)}
                />
              </div>
            </div>
          )
        })}

        {cards.length === 0 &&
          (draggingId != null ? (
            <div
              data-dropzone="true"
              className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground"
            >
              Tarik tugas ke sini
            </div>
          ) : adding ? null : (
            <Button
              variant="ghost"
              size="sm"
              data-dropzone="true"
              className="justify-start text-muted-foreground"
              onClick={() => setAdding(true)}
            >
              <Plus className="mr-1 size-3.5" aria-hidden />
              Tambah tugas
            </Button>
          ))}

        {adding && (
          <Input
            data-dropzone="true"
            autoFocus
            value={draft}
            placeholder="Judul tugas…"
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
            aria-label={`Tambah tugas ke ${list.title}`}
          />
        )}
      </div>

      {/* Pointer-following clone. Portalled to `body` so the column's
          `overflow-y-auto` can't clip it and no stacking context traps it. */}
      {dragProxy &&
        draggingIndex != null &&
        cards[draggingIndex] &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 opacity-90 shadow-lg"
            style={{
              left: dragProxy.x,
              top: dragProxy.y,
              width: dragProxy.width,
            }}
          >
            <TaskCard
              task={cards[draggingIndex]}
              tz={tz}
              labels={labelsFor(cards[draggingIndex].labelIds)}
              ready={readySet ? readySet.has(cards[draggingIndex].id) : true}
              compact={compact}
              dragging
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
