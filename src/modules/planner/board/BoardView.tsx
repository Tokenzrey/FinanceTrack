'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import type { DragSortResult } from '@/shared/hooks/useDragSort'
import { DEFAULT_TZ } from '@/shared/lib/format'
import { rankBetween } from '@/shared/lib/rank'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { migrateLegacyTasks } from '@/shared/use-cases/board/MigrateLegacyTasks.usecase'
import { moveTask } from '@/shared/use-cases/board/MoveTask.usecase'
import { reorderList } from '@/shared/use-cases/board/ReorderList.usecase'
import { seedDefaultBoard } from '@/shared/use-cases/board/SeedDefaultBoard.usecase'
import type { Task } from '@/shared/types/productivity'
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
  const clearFilters = usePlannerStore((s) => s.clearFilters)
  const addTask = usePlannerStore((s) => s.addTask)
  const openTask = usePlannerStore((s) => s.openTask)

  const [seeding, setSeeding] = useState(false)
  const [compact, setCompact] = useState(true)

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
      void moveTask(uid, moved.id, r.toContainerId, newOrder, lists).catch(() => {
        toast.error('Gagal memindahkan tugas.')
      })
    },
    [uid, cardsByList, lists, setDraggingId],
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
      void reorderList(uid, listId, newOrder).catch(() => toast.error('Gagal mengurutkan kolom.'))
    },
    [uid, sortedLists],
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
        <span className="text-xs text-muted-foreground">{compact ? 'Rapat' : 'Nyaman'}</span>
        <Button size="sm" variant="outline" onClick={() => setCompact((v) => !v)}>
          {compact ? 'Nyaman' : 'Rapat'}
        </Button>
      </div>

      <div
        className="flex h-[calc(100vh-20rem)] gap-3 overflow-x-auto pb-2"
        onPointerDown={onColumnPointerDown}
      >
        {sortedLists.map((list, i) => (
          <div key={list.id} className="flex h-full flex-col">
            <div className="mb-1 flex items-center justify-between px-1">
              <button
                type="button"
                aria-label={`Pindahkan kolom ${list.title} ke kiri`}
                disabled={i === 0}
                onClick={() => moveColumn(list.id, -1)}
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label={`Pindahkan kolom ${list.title} ke kanan`}
                disabled={i === sortedLists.length - 1}
                onClick={() => moveColumn(list.id, 1)}
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▶
              </button>
            </div>
            <BoardColumn
              list={list}
              lists={lists}
              cards={cardsByList.get(list.id) ?? []}
              tz={tz}
              labelsById={labelsById}
              compact={compact}
              draggingId={draggingId}
              registerBody={registerBody}
              getContainerItems={getContainerItems}
              onCardDrop={onCardDrop}
              onInlineAdd={onInlineAdd}
              onOpenTask={(task) => openTask(task.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
