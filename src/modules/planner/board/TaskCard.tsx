'use client'

import { useRef } from 'react'
import type * as React from 'react'
import { Lock, Paperclip } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'
import type { Label } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'
import { DueChip } from '../shared/DueChip'
import { LabelStrip } from '../shared/LabelStrip'
import { PriorityDot } from '../shared/PriorityDot'
import { SourceGlyph } from '../shared/SourceGlyph'

/** Pointer travel (px) past which a release counts as a drag, not a click. */
const CLICK_SLOP = 6

interface TaskCardProps {
  task: Task
  tz: string
  labels: Label[]
  /** True while this card is the lifted one in its column's `useDragSort`. */
  dragging?: boolean
  /** Compact = the "Rapat" density; tightens the metadata row spacing. */
  compact?: boolean
  /** False → task has an unfinished blocker; shows a quiet lock marker. Default true. */
  ready?: boolean
  /** Task 10's `TaskDetailPanel` opener. Undefined until Task 10 lands → card is not clickable. */
  onOpen?: (task: Task) => void
  /** Drag props from the column's `useDragSort.getItemProps(index)`. */
  dragProps?: Partial<React.HTMLAttributes<HTMLDivElement>> & {
    tabIndex?: number
    role?: string
    'aria-roledescription'?: string
  }
}

export function TaskCard({
  task,
  tz,
  labels,
  dragging,
  compact,
  ready = true,
  onOpen,
  dragProps,
}: TaskCardProps) {
  const checklist = task.checklist ?? []
  const doneCount = checklist.filter((c) => c.done).length
  const total = checklist.length
  const attachments = task.attachments?.length ?? 0
  const blocked = (task.dependsOn?.length ?? 0) > 0 && !ready
  const hasMeta = Boolean(task.dueAt) || total > 0 || attachments > 0

  // A pointer release after a real drag still fires `click`, which would open the
  // detail panel every time a card is dropped. Track travel from the press and
  // swallow that one click — same guard `TimelineBar` uses for its bars.
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const draggedRef = useRef(false)

  return (
    <div
      {...dragProps}
      onPointerDown={(e) => {
        pressRef.current = { x: e.clientX, y: e.clientY }
        draggedRef.current = false
        dragProps?.onPointerDown?.(e)
      }}
      onPointerUp={(e) => {
        const p = pressRef.current
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) {
          draggedRef.current = true
        }
        pressRef.current = null
        dragProps?.onPointerUp?.(e)
      }}
      onClick={
        onOpen
          ? () => {
              if (draggedRef.current) {
                draggedRef.current = false
                return
              }
              onOpen(task)
            }
          : undefined
      }
      className={cn(
        'relative rounded-lg border border-border bg-card p-2.5 text-left',
        onOpen && 'cursor-pointer',
        dragging
          ? 'z-10 scale-[1.02] shadow-md ring-1 ring-ring transition-none'
          : 'transition-[box-shadow] duration-150 hover:shadow-sm motion-reduce:transition-none',
      )}
    >
      <span className="absolute right-1.5 top-1.5">
        <PriorityDot priority={task.priority} />
      </span>

      <LabelStrip labels={labels} />

      <p className="mt-1 line-clamp-2 pr-3 font-sans text-sm font-medium leading-snug">
        {task.title}
      </p>

      <div
        className={cn(
          'mt-1.5 flex flex-wrap items-center text-xs text-muted-foreground',
          compact ? 'gap-1.5' : 'gap-2',
        )}
      >
        {hasMeta && <DueChip dueAt={task.dueAt} tz={tz} />}

        {total > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="font-mono tabular-nums">
              {doneCount}/{total}
            </span>
            <span className="h-0.5 w-8 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-foreground/40"
                style={{ width: `${(doneCount / total) * 100}%` }}
              />
            </span>
          </span>
        )}

        {attachments > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" aria-hidden />
            <span className="font-mono tabular-nums">{attachments}</span>
          </span>
        )}

        {blocked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" aria-label="Menunggu dependency">
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>Menunggu tugas lain selesai</TooltipContent>
          </Tooltip>
        )}

        <SourceGlyph source={task.source} />
      </div>
    </div>
  )
}
