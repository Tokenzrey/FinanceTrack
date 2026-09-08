'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Tag } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import type { DragSortResult } from '@/shared/hooks/useDragSort'
import { useUndoStack } from '@/shared/hooks/useUndoStack'
import { DEFAULT_TZ } from '@/shared/lib/format'
import { rankBetween } from '@/shared/lib/rank'
import { repositories } from '@/shared/repositories'
import { readyTasks } from '@/shared/lib/task-graph'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { migrateLegacyTasks } from '@/shared/use-cases/board/MigrateLegacyTasks.usecase'
import { moveTask } from '@/shared/use-cases/board/MoveTask.usecase'
import { reorderList } from '@/shared/use-cases/board/ReorderList.usecase'
import { seedDefaultBoard } from '@/shared/use-cases/board/SeedDefaultBoard.usecase'
import type { Task } from '@/shared/types/productivity'
import { LabelManagerDialog } from '../detail/LabelManagerDialog'
import { applyBoardFilters, describeActiveFilters } from '../shared/FilterBar'
import { BoardColumn } from './BoardColumn'

/** uids whose board has been seed+migrated this session — guards the mount effect. */
const seededUids = new Set<string>()

export function BoardView() {
  const uid = useAuthStore((s) => s.user?.uid)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const lists = usePlannerStore((s) => s.lists)
  const tasks = usePlannerStore((s) => s.tasks)
  const labels = usePlannerStore((s) => s.labels)
  const filters = usePlannerStore((s) => s.filters)
  const draggingId = usePlannerStore((s) => s.draggingId)
  const setDraggingId = usePlannerStore((s) => s.setDraggingId)
  const dragOverListId = usePlannerStore((s) => s.dragOverListId)
  const setDragOverListId = usePlannerStore((s) => s.setDragOverListId)
  const clearFilters = usePlannerStore((s) => s.clearFilters)
  const addTask = usePlannerStore((s) => s.addTask)
  const openTask = usePlannerStore((s) => s.openTask)

  const undo = useUndoStack((label) => toast.success(`Dibatalkan: ${label}`))

  const [seeding, setSeeding] = useState(false)
  const [compact, setCompact] = useState(true)
  const [labelMgrOpen, setLabelMgrOpen] = useState(false)

  useEffect(() => {
    if (!uid || seededUids.has(uid)) return
    seededUids.add(uid)
    setSeeding(true)
    void (async () => {
      try {
        await seedDefaultBoard(uid)
        await migrateLegacyTasks(uid)
      } catch {
        seededUids.delete(uid) // let a remount retry
        toast.error('Gagal menyiapkan papan.')
      } finally {
        setSeeding(false)
      }
    })()
  }, [uid])

  // Column scroll bodies, for cross-column drop hit-testing.
  const bodiesRef = useRef(new Map<string, HTMLElement>())
  const registerBody = useCallback((listId: string, el: HTMLElement | null) => {
    if (el) bodiesRef.current.set(listId, el)
    else bodiesRef.current.delete(listId)
  }, [])

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])

  // "Ready" = every blocker done. Computed once over all tasks; a card is
  // "blocked" (quiet marker) when it has deps and isn't in this set.
  const readySet = useMemo(() => readyTasks(tasks), [tasks])

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  // filtered + grouped by column, each group sorted by `order`.
  const cardsByList = useMemo(() => {
    const visible = applyBoardFilters(tasks, filters)
    const map = new Map<string, Task[]>()
    for (const list of sortedLists) {
      map.set(
        list.id,
        visible
          .filter((t) => t.listId === list.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      )
    }
    return map
  }, [tasks, filters, sortedLists])

  const getContainerItems = useCallback((id: string) => {
    const body = bodiesRef.current.get(id)
    if (!body) return null
    const rects = Array.from(body.children)
      .filter((c) => (c as HTMLElement).dataset.dropzone !== 'true')
      .map((c) => c.getBoundingClientRect())
    return { containerId: id, rects }
  }, [])

  const onCardDrop = useCallback(
    (r: DragSortResult) => {
      setDraggingId(null)
      if (!uid) return
      const fromCards = cardsByList.get(r.fromContainerId) ?? []
      const toCards = cardsByList.get(r.toContainerId) ?? []
      const moved = fromCards[r.fromIndex]
      if (!moved) return

      // Neighbours around the insert slot in the target column, excluding the moved card.
      const target = toCards.filter((t) => t.id !== moved.id)
      const clamped = Math.max(0, Math.min(r.toIndex, target.length))
      const prev = target[clamped - 1] ?? null
      const next = target[clamped] ?? null
      if (
        r.fromContainerId === r.toContainerId &&
        prev?.id === (fromCards[r.fromIndex - 1]?.id ?? null) &&
        next?.id === (fromCards[r.fromIndex + 1]?.id ?? null)
      ) {
        return // dropped back where it started
      }

      const newOrder = rankBetween(prev?.order ?? null, next?.order ?? null)
      const destTasks = (cardsByList.get(r.toContainerId) ?? []).filter((t) => t.id !== moved.id)

      // Capture where it came from before the write, so Ctrl+Z can put it back.
      const fromListId = moved.listId ?? r.fromContainerId
      const fromOrder = moved.order ?? 0
      undo.push({
        label: 'pindah kartu',
        undo: () => moveTask(uid, moved.id, fromListId, fromOrder, lists),
      })

      void moveTask(uid, moved.id, r.toContainerId, newOrder, lists, destTasks).catch(() => {
        toast.error('Gagal memindahkan tugas.')
      })
    },
    [uid, cardsByList, lists, setDraggingId, undo],
  )

  // Mark drag start so empty columns reveal their drop zone. `useDragSort` has no
  // "lift" callback, so we flip `draggingId` on the first pointerdown inside a card.
  const onColumnPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-dragsort-container] [role="button"]')) {
        setDraggingId('active')
      }
    },
    [setDraggingId],
  )
  useEffect(() => {
    if (!draggingId) return
    const clear = () => setDraggingId(null)
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
    }
  }, [draggingId, setDraggingId])

  const onInlineAdd = useCallback(
    (listId: string, title: string) => {
      if (!uid) return
      void (async () => {
        try {
          const created = await addTask({ title, source: 'web' })
          const cards = cardsByList.get(listId) ?? []
          const last = cards[cards.length - 1]
          const order = rankBetween(last?.order ?? null, null)
          await moveTask(uid, created.id, listId, order, lists)
        } catch {
          toast.error('Gagal menambah tugas.')
        }
      })()
    },
    [uid, addTask, cardsByList, lists],
  )

  const moveColumn = useCallback(
    (listId: string, dir: -1 | 1) => {
      if (!uid) return
      const i = sortedLists.findIndex((l) => l.id === listId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= sortedLists.length) return
      // Insert between the neighbour past the swap target.
      const before = dir === 1 ? sortedLists[j] : sortedLists[j - 1]
      const after = dir === 1 ? sortedLists[j + 1] : sortedLists[j]
      const newOrder = rankBetween(before?.order ?? null, after?.order ?? null)
      const prevOrder = sortedLists[i].order
      undo.push({
        label: 'urutkan kolom',
        undo: () => reorderList(uid, listId, prevOrder),
      })
      void reorderList(uid, listId, newOrder).catch(() => toast.error('Gagal mengurutkan kolom.'))
    },
    [uid, sortedLists, undo],
  )

  const expandColumn = useCallback(
    (listId: string) => {
      if (!uid) return
      void repositories.boardLists
        .update(uid, listId, { isCollapsed: false })
        .catch(() => toast.error('Gagal membuka kolom.'))
    },
    [uid],
  )

  if (lists.length === 0) {
    return seeding || !uid ? (
      <LoadingSkeleton rows={4} />
    ) : (
      <p className="rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Papan belum siap. Muat ulang halaman.
      </p>
    )
  }

  const anyVisible = sortedLists.some((l) => (cardsByList.get(l.id) ?? []).length > 0)
  const activeFilters = describeActiveFilters(filters, lists, labels)
  if (!anyVisible && activeFilters.length > 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Tidak ada tugas yang cocok dengan filter: {activeFilters.join(', ')}.
        </p>
        <Button size="sm" variant="outline" onClick={clearFilters}>
          Hapus filter
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLabelMgrOpen(true)}>
          <Tag className="h-3.5 w-3.5" aria-hidden />
          Label
        </Button>
        <span className="text-xs text-muted-foreground">{compact ? 'Rapat' : 'Nyaman'}</span>
        <Button size="sm" variant="outline" onClick={() => setCompact((v) => !v)}>
          {compact ? 'Nyaman' : 'Rapat'}
        </Button>
      </div>

      <LabelManagerDialog open={labelMgrOpen} onOpenChange={setLabelMgrOpen} />

      <div
        className="flex h-[calc(100vh-20rem)] gap-3 overflow-x-auto pb-2"
        onPointerDown={onColumnPointerDown}
      >
        {sortedLists.map((list, i) => (
          <div key={list.id} className="group/col flex h-full flex-col">
            {!list.isCollapsed && (
              <div className="mb-1 flex items-center justify-between px-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/col:opacity-100 motion-reduce:transition-none">
                <button
                  type="button"
                  aria-label={`Pindahkan kolom ${list.title} ke kiri`}
                  disabled={i === 0}
                  onClick={() => moveColumn(list.id, -1)}
                  className="rounded p-0.5 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 motion-reduce:transition-none"
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Pindahkan kolom ${list.title} ke kanan`}
                  disabled={i === sortedLists.length - 1}
                  onClick={() => moveColumn(list.id, 1)}
                  className="rounded p-0.5 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 motion-reduce:transition-none"
                >
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
            <BoardColumn
              list={list}
              lists={lists}
              cards={cardsByList.get(list.id) ?? []}
              tz={tz}
              labelsById={labelsById}
              readySet={readySet}
              compact={compact}
              draggingId={draggingId}
              dragOverListId={dragOverListId}
              setDragOverListId={setDragOverListId}
              registerBody={registerBody}
              getContainerItems={getContainerItems}
              onCardDrop={onCardDrop}
              onInlineAdd={onInlineAdd}
              onExpand={expandColumn}
              onOpenTask={(task) => openTask(task.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
