import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'

/**
 * Pointer-events drag-to-sort. No HTML5 native DnD (broken on touch, poor a11y),
 * no DnD library (repo rule: no new dependencies). Reports indices only — the
 * caller feeds the neighbours around `toIndex` to `rankBetween` for the new order.
 *
 * The consumer owns the visuals. This hook only:
 *  - marks the lifted item with `data-dragging`
 *  - emits an `announcement` string for an `aria-live="polite"` node it renders
 *  - calls `onDrop({ fromIndex, toIndex, fromContainerId, toContainerId })`
 */

/** Pointer travel (px) before a press becomes a drag. Below this, it's a click. */
const DRAG_THRESHOLD = 6

/** Container elements the consumer marks so cross-container hover can find them. */
const CONTAINER_ATTR = 'data-dragsort-container'

export interface DragSortResult {
  fromIndex: number
  toIndex: number
  fromContainerId: string
  toContainerId: string
}

export interface UseDragSortOptions {
  containerId: string
  itemCount: number
  onDrop: (r: DragSortResult) => void
  /**
   * Resolve the item rects for a container id, used when the pointer is over a
   * different container than the one that owns the dragged item. Omit for
   * same-container reorder only (then `toContainerId === containerId` always).
   */
  getContainerItems?: (containerId: string) => { containerId: string; rects: DOMRect[] } | null
}

interface GetItemProps {
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  tabIndex: 0
  role: 'button'
  'aria-roledescription': string
  style?: React.CSSProperties
  'data-dragging'?: boolean
}

/**
 * For a vertical list: the insert index is the count of items whose vertical
 * midpoint sits above `pointerY`.
 *  - above item 0's midpoint -> 0
 *  - over the top half of item k -> k
 *  - over the bottom half of item k -> k + 1
 *  - below the last midpoint -> itemRects.length
 *  - empty -> 0
 */
export function computeInsertIndex(itemRects: DOMRect[], pointerY: number): number {
  let index = 0
  for (const rect of itemRects) {
    const midpoint = rect.top + rect.height / 2
    if (midpoint < pointerY) index++
    else break
  }
  return index
}

interface PointerCandidate {
  index: number
  startX: number
  startY: number
  pointerId: number
  el: Element
}

export function useDragSort(opts: UseDragSortOptions): {
  getItemProps: (index: number) => GetItemProps
  draggingIndex: number | null
  announcement: string
} {
  const { containerId, itemCount, onDrop, getContainerItems } = opts

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Live drag state kept in refs — pointer/key handlers read it without re-binding.
  const candidateRef = useRef<PointerCandidate | null>(null)
  const draggingRef = useRef(false)
  const fromIndexRef = useRef<number>(-1)
  const toIndexRef = useRef<number>(-1)
  const toContainerRef = useRef<string>(containerId)
  // Keyboard lift is separate from pointer drag: no pointer capture, same-container.
  const liftedRef = useRef<number | null>(null)

  // Keep the latest onDrop without re-subscribing the window listeners.
  const onDropRef = useRef(onDrop)
  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])
  const getContainerItemsRef = useRef(getContainerItems)
  useEffect(() => {
    getContainerItemsRef.current = getContainerItems
  }, [getContainerItems])

  const reset = useCallback(() => {
    candidateRef.current = null
    draggingRef.current = false
    fromIndexRef.current = -1
    toIndexRef.current = -1
    toContainerRef.current = containerId
    setDraggingIndex(null)
  }, [containerId])

  /** Own-container item rects, read live from the DOM at each pointermove. */
  const ownRects = useCallback((): DOMRect[] => {
    const container = document.querySelector(`[${CONTAINER_ATTR}="${containerId}"]`)
    const scope = container ?? candidateRef.current?.el.parentElement
    if (!scope) return []
    // Direct children only — nested lists (e.g. a card's checklist) stay out.
    return Array.from(scope.children).map((c) => c.getBoundingClientRect())
  }, [containerId])

  const updateHover = useCallback(
    (clientX: number, clientY: number) => {
      let rects = ownRects()
      let toContainer = containerId

      const resolve = getContainerItemsRef.current
      if (resolve) {
        const under = document.elementFromPoint(clientX, clientY)?.closest(`[${CONTAINER_ATTR}]`)
        const overId = under?.getAttribute(CONTAINER_ATTR)
        if (overId && overId !== containerId) {
          const resolved = resolve(overId)
          if (resolved) {
            rects = resolved.rects
            toContainer = resolved.containerId
          }
        }
      }

      const to = computeInsertIndex(rects, clientY)
      toIndexRef.current = to
      toContainerRef.current = toContainer
    },
    [containerId, ownRects],
  )

  // Window listeners live for the component's lifetime; they no-op unless a
  // candidate press is active. This keeps setPointerCapture + move tracking
  // working even if the pointer leaves the item element.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const cand = candidateRef.current
      if (!cand || e.pointerId !== cand.pointerId) return

      if (!draggingRef.current) {
        const dx = e.clientX - cand.startX
        const dy = e.clientY - cand.startY
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return
        draggingRef.current = true
        fromIndexRef.current = cand.index
        setDraggingIndex(cand.index)
        setAnnouncement(`Mengangkat item ${cand.index + 1}`)
      }

      updateHover(e.clientX, e.clientY)
    }

    function onUp(e: PointerEvent) {
      const cand = candidateRef.current
      if (!cand || e.pointerId !== cand.pointerId) return

      if (draggingRef.current) {
        onDropRef.current({
          fromIndex: fromIndexRef.current,
          toIndex: toIndexRef.current,
          fromContainerId: containerId,
          toContainerId: toContainerRef.current,
        })
        setAnnouncement('Item dipindahkan')
      }
      // No drag: do nothing — the native click on the element fires normally.
      reset()
    }

    function onCancel(e: PointerEvent) {
      const cand = candidateRef.current
      if (!cand || e.pointerId !== cand.pointerId) return
      reset()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [containerId, reset, updateHover])

  const onPointerDown = useCallback((index: number, e: React.PointerEvent) => {
    candidateRef.current = {
      index,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      el: e.currentTarget,
    }
    // Capture so we keep getting move/up even if the pointer leaves the element.
    // Do NOT preventDefault here — that would eat the click in the no-drag case.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // jsdom / unsupported — window listeners still cover the common path.
    }
  }, [])

  const onKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      const key = e.key
      const lifted = liftedRef.current

      if ((key === ' ' || key === 'Enter') && lifted === null) {
        e.preventDefault()
        liftedRef.current = index
        toIndexRef.current = index
        setDraggingIndex(index)
        setAnnouncement(
          `Item ${index + 1} diangkat. Panah untuk memindahkan, spasi untuk menjatuhkan, Escape untuk batal.`,
        )
        return
      }

      if (lifted === null) return

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault()
        const delta = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
        const next = Math.min(itemCount, Math.max(0, toIndexRef.current + delta))
        toIndexRef.current = next
        setAnnouncement(`Posisi ${next + 1} dari ${itemCount}`)
        return
      }

      if (key === ' ' || key === 'Enter') {
        e.preventDefault()
        const to = toIndexRef.current
        onDropRef.current({
          fromIndex: lifted,
          toIndex: to,
          fromContainerId: containerId,
          toContainerId: containerId,
        })
        liftedRef.current = null
        setDraggingIndex(null)
        setAnnouncement(`Item dijatuhkan di posisi ${to + 1}`)
        return
      }

      if (key === 'Escape') {
        e.preventDefault()
        liftedRef.current = null
        setDraggingIndex(null)
        setAnnouncement('Dibatalkan')
      }
    },
    [containerId, itemCount],
  )

  const getItemProps = useCallback(
    (index: number): GetItemProps => {
      const isDragging = draggingIndex === index
      return {
        onPointerDown: (e) => onPointerDown(index, e),
        onKeyDown: (e) => onKeyDown(index, e),
        tabIndex: 0,
        role: 'button',
        'aria-roledescription': 'Item yang bisa dipindahkan',
        // No transition — the consumer applies its own visual; a follow transform
        // (if any) must be instantaneous.
        style: isDragging ? { transition: 'none' } : undefined,
        'data-dragging': isDragging || undefined,
      }
    },
    [draggingIndex, onPointerDown, onKeyDown],
  )

  return { getItemProps, draggingIndex, announcement }
}
