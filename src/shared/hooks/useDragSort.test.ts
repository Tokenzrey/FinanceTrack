import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { adjustSameContainerIndex, computeInsertIndex, useDragSort } from './useDragSort'

// --- 1. computeInsertIndex: pure, no DOM -------------------------------------

/** 5 items, each 20px tall, stacked from y=0: midpoints at 10, 30, 50, 70, 90. */
const rects = Array.from({ length: 5 }, (_, i) => ({ top: i * 20, height: 20 }) as DOMRect)

describe('computeInsertIndex', () => {
  it('returns 0 when pointer is above every midpoint', () => {
    expect(computeInsertIndex(rects, -5)).toBe(0)
    expect(computeInsertIndex(rects, 9)).toBe(0)
  })

  it('returns 2 when pointer is between item 1 and item 2 midpoints', () => {
    // midpoints: item1 = 30, item2 = 50 -> pointer at 40 sits below 2 midpoints
    expect(computeInsertIndex(rects, 40)).toBe(2)
  })

  it('returns k over the top half of item k', () => {
    // item 2 spans 40..60, midpoint 50 -> top half is 40..50
    expect(computeInsertIndex(rects, 45)).toBe(2)
  })

  it('returns k + 1 over the bottom half of item k', () => {
    // item 2 bottom half is 50..60
    expect(computeInsertIndex(rects, 55)).toBe(3)
  })

  it('returns length when pointer is below every midpoint', () => {
    expect(computeInsertIndex(rects, 999)).toBe(5)
  })

  it('returns 0 for an empty list', () => {
    expect(computeInsertIndex([], 123)).toBe(0)
  })
})

// --- 1b. adjustSameContainerIndex: pre-removal -> post-removal --------------

describe('adjustSameContainerIndex', () => {
  it('shifts down when dropping below the item’s own slot', () => {
    // [A,B,C], drag A into the B/C gap: raw 2 -> 1, so the neighbours are B and C.
    expect(adjustSameContainerIndex(2, 0)).toBe(1)
    expect(adjustSameContainerIndex(3, 1)).toBe(2)
  })

  it('leaves an upward drag alone', () => {
    expect(adjustSameContainerIndex(0, 2)).toBe(0)
  })

  it('leaves a drop at the item’s own slot alone', () => {
    expect(adjustSameContainerIndex(2, 2)).toBe(2)
  })
})

// --- test harness component ------------------------------------------------

function Harness(props: {
  itemCount: number
  onDrop: (r: Parameters<Parameters<typeof useDragSort>[0]['onDrop']>[0]) => void
  onClick?: () => void
}) {
  const { getItemProps, announcement } = useDragSort({
    containerId: 'col-a',
    itemCount: props.itemCount,
    onDrop: props.onDrop,
  })
  return createElement(
    'div',
    null,
    Array.from({ length: props.itemCount }, (_, i) =>
      createElement(
        'div',
        {
          key: i,
          'data-testid': `item-${i}`,
          onClick: props.onClick,
          ...getItemProps(i),
        },
        `item ${i}`,
      ),
    ),
    createElement('output', { 'data-testid': 'live' }, announcement),
  )
}

// --- 2. pointerdown -> pointerup with no move: click passes through --------

describe('useDragSort pointer', () => {
  it('does not call onDrop and lets the native click fire when there is no drag', () => {
    const onDrop = vi.fn()
    const onClick = vi.fn()
    render(createElement(Harness, { itemCount: 3, onDrop, onClick }))

    const item = screen.getByTestId('item-1')
    fireEvent.pointerDown(item, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.click(item)

    expect(onDrop).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// --- 3. keyboard lift / move / drop / cancel ------------------------------

describe('useDragSort keyboard', () => {
  it('lifts, moves down twice, and drops at fromIndex + 2', () => {
    const onDrop = vi.fn()
    render(createElement(Harness, { itemCount: 5, onDrop }))

    const item = screen.getByTestId('item-1')
    item.focus()
    fireEvent.keyDown(item, { key: ' ' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: ' ' })

    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith({
      fromIndex: 1,
      toIndex: 3,
      fromContainerId: 'col-a',
      toContainerId: 'col-a',
    })
  })

  it('clamps the target to itemCount', () => {
    const onDrop = vi.fn()
    render(createElement(Harness, { itemCount: 3, onDrop }))

    const item = screen.getByTestId('item-2')
    item.focus()
    fireEvent.keyDown(item, { key: ' ' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: 'Enter' })

    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ fromIndex: 2, toIndex: 3 }))
  })

  it('does not call onDrop when Escape is pressed after a lift', () => {
    const onDrop = vi.fn()
    render(createElement(Harness, { itemCount: 5, onDrop }))

    const item = screen.getByTestId('item-1')
    item.focus()
    fireEvent.keyDown(item, { key: ' ' })
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.keyDown(item, { key: 'Escape' })

    expect(onDrop).not.toHaveBeenCalled()
  })
})
