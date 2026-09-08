'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'

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
  onOpenTask?: (task: Task) => void
}

export function BoardColumn({
  list,
  lists,
  cards,
  tz,
  labelsById,
  compact,
  draggingId,
  registerBody,
  getContainerItems,
  onCardDrop,
  onInlineAdd,
  onOpenTask,
}: BoardColumnProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    registerBody(list.id, bodyRef.current)
    return () => registerBody(list.id, null)
  }, [list.id, registerBody])

  const { getItemProps, draggingIndex } = useDragSort({
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
    return (
      <div
        ref={bodyRef}
        data-dragsort-container={list.id}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-2 rounded-lg bg-muted/40 py-3"
        title={list.title}
      >
        <span className="[writing-mode:vertical-rl] font-display text-[13px] font-semibold uppercase tracking-wide">
          {list.title}
        </span>
        <span className={cn('font-mono text-xs', overWip ? 'text-destructive' : 'text-muted-foreground')}>
          {count}
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-lg bg-muted/40">
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg bg-muted/40 px-3 py-2 backdrop-blur">
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
        ref={bodyRef}
        data-dragsort-container={list.id}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2',
          isDropTarget && 'ring-2 ring-inset ring-ring',
        )}
      >
        {cards.map((task, index) => (
          <div key={task.id} className="motion-reduce:transition-none">
            {draggingIndex === index ? (
              <div
                className="rounded-lg border border-dashed border-border transition duration-200 motion-reduce:transition-none"
                style={{ height: 0, minHeight: 56 }}
                aria-hidden
              />
            ) : (
              <TaskCard
                task={task}
                tz={tz}
                labels={labelsFor(task.labelIds)}
                compact={compact}
                dragging={false}
                onOpen={onOpenTask}
                dragProps={getItemProps(index)}
              />
            )}
          </div>
        ))}

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
    </div>
  )
}
