import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import type { BoardFilters, BoardList, Label } from '@/shared/types/board'
import { EMPTY_BOARD_FILTERS } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'

import { applyBoardFilters, describeActiveFilters, FilterBar } from './FilterBar'

const ts = () => Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  title: 'Tinjau PRD',
  notes: null,
  status: 'todo',
  priority: 'med',
  dueAt: null,
  doneAt: null,
  source: 'web',
  createdAt: ts(),
  updatedAt: ts(),
  ...over,
})

const label = (over: Partial<Label>): Label => ({
  id: 'l1',
  name: 'Urgent',
  colorKey: 'red',
  order: 0,
  createdAt: ts(),
  ...over,
})

const list = (over: Partial<BoardList>): BoardList => ({
  id: 'c1',
  title: 'Sedang Dikerjakan',
  order: 0,
  mapsToStatus: 'doing',
  wipLimit: null,
  isCollapsed: false,
  createdAt: ts(),
  updatedAt: ts(),
  ...over,
})

describe('applyBoardFilters', () => {
  it('excludes a task whose priority is not in the priority filter', () => {
    const tasks = [task({ id: 'a', priority: 'high' }), task({ id: 'b', priority: 'low' })]
    const filters: BoardFilters = { ...EMPTY_BOARD_FILTERS, priorities: ['low'] }
    expect(applyBoardFilters(tasks, filters).map((t) => t.id)).toEqual(['b'])
  })

  it('passes everything when the priority filter is empty', () => {
    const tasks = [task({ id: 'a', priority: 'high' }), task({ id: 'b', priority: 'low' })]
    expect(applyBoardFilters(tasks, EMPTY_BOARD_FILTERS)).toHaveLength(2)
  })

  it('matches search as a case-insensitive substring of the title', () => {
    const tasks = [task({ id: 'a', title: 'Tinjau PRD' }), task({ id: 'b', title: 'Bayar listrik' })]
    const filters: BoardFilters = { ...EMPTY_BOARD_FILTERS, search: 'prd' }
    expect(applyBoardFilters(tasks, filters).map((t) => t.id)).toEqual(['a'])
  })

  it('filters by label, list, and hasDue', () => {
    const tasks = [
      task({ id: 'a', labelIds: ['l1'], listId: 'c1', dueAt: ts() }),
      task({ id: 'b', labelIds: ['l2'], listId: 'c2', dueAt: null }),
    ]
    expect(
      applyBoardFilters(tasks, { ...EMPTY_BOARD_FILTERS, labelIds: ['l1'] }).map((t) => t.id),
    ).toEqual(['a'])
    expect(
      applyBoardFilters(tasks, { ...EMPTY_BOARD_FILTERS, listIds: ['c2'] }).map((t) => t.id),
    ).toEqual(['b'])
    expect(
      applyBoardFilters(tasks, { ...EMPTY_BOARD_FILTERS, hasDue: true }).map((t) => t.id),
    ).toEqual(['a'])
    expect(
      applyBoardFilters(tasks, { ...EMPTY_BOARD_FILTERS, hasDue: false }).map((t) => t.id),
    ).toEqual(['b'])
  })
})

describe('describeActiveFilters', () => {
  it('includes the active label name', () => {
    const filters: BoardFilters = { ...EMPTY_BOARD_FILTERS, labelIds: ['l1'] }
    const out = describeActiveFilters(filters, [list({})], [label({ id: 'l1', name: 'Urgent' })])
    expect(out).toContain('Urgent')
  })

  it('is empty when no filter is active', () => {
    expect(describeActiveFilters(EMPTY_BOARD_FILTERS, [], [])).toEqual([])
  })
})

// ─── FilterBar render (store mocked) ───

const setFilters = vi.fn()
const clearFilters = vi.fn()
let storeState: {
  filters: BoardFilters
  setFilters: typeof setFilters
  clearFilters: typeof clearFilters
  lists: BoardList[]
  labels: Label[]
}

vi.mock('@/shared/stores/planner.store', () => ({
  usePlannerStore: Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}))

describe('FilterBar', () => {
  beforeEach(() => {
    setFilters.mockClear()
    clearFilters.mockClear()
    storeState = {
      filters: { ...EMPTY_BOARD_FILTERS, labelIds: ['l1'] },
      setFilters,
      clearFilters,
      lists: [list({})],
      labels: [label({ id: 'l1', name: 'Urgent' })],
    }
  })

  it('shows a "Hapus semua" control when a filter is active', () => {
    render(<FilterBar />)
    expect(screen.getByRole('button', { name: /hapus semua/i })).toBeInTheDocument()
  })

  it('drops just that label when its chip remove button is clicked', () => {
    render(<FilterBar />)
    fireEvent.click(screen.getByRole('button', { name: /buang filter urgent/i }))
    expect(setFilters).toHaveBeenCalledWith({ labelIds: [] })
  })
})
