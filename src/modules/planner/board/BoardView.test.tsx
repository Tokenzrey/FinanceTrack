import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import { EMPTY_BOARD_FILTERS } from '@/shared/types/board'
import type { BoardList, BoardFilters, Label } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'

// ─── Mocks ───
// Seed/migrate are async no-ops; the store already has the lists.
vi.mock('@/shared/use-cases/board/SeedDefaultBoard.usecase', () => ({
  seedDefaultBoard: vi.fn(async () => {}),
}))
vi.mock('@/shared/use-cases/board/MigrateLegacyTasks.usecase', () => ({
  migrateLegacyTasks: vi.fn(async () => {}),
}))
const { moveTask } = vi.hoisted(() => ({ moveTask: vi.fn() }))
vi.mock('@/shared/use-cases/board/MoveTask.usecase', () => ({ moveTask }))
vi.mock('@/shared/use-cases/board/ReorderList.usecase', () => ({ reorderList: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const ts = () => Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))

const list = (over: Partial<BoardList>): BoardList => ({
  id: 'c1',
  title: 'Backlog',
  order: 1000,
  mapsToStatus: 'todo',
  wipLimit: null,
  isCollapsed: false,
  createdAt: ts(),
  updatedAt: ts(),
  ...over,
})

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

const LISTS = [list({ id: 'c1', title: 'Backlog', order: 1000 }), list({ id: 'c2', title: 'Selesai', mapsToStatus: 'done', order: 2000 })]
const TASKS = [
  task({ id: 'a', title: 'Task A', listId: 'c1', order: 1000, priority: 'high' }),
  task({ id: 'b', title: 'Task B', listId: 'c1', order: 2000, priority: 'low' }),
  task({ id: 'c', title: 'Task C', listId: 'c2', order: 1000, priority: 'med' }),
]

let storeState: {
  lists: BoardList[]
  tasks: Task[]
  labels: Label[]
  filters: BoardFilters
  draggingId: string | null
  setDraggingId: ReturnType<typeof vi.fn>
  clearFilters: ReturnType<typeof vi.fn>
  addTask: ReturnType<typeof vi.fn>
}

vi.mock('@/shared/stores/planner.store', () => ({
  usePlannerStore: Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}))
vi.mock('@/shared/stores/auth.store', () => {
  const authState = { user: { uid: 'u1' }, profile: { timezone: 'Asia/Jakarta' } }
  return {
    useAuthStore: Object.assign(
      (selector: (s: typeof authState) => unknown) => selector(authState),
      { getState: () => authState },
    ),
  }
})

import { BoardView } from './BoardView'

beforeEach(() => {
  moveTask.mockReset().mockResolvedValue(undefined)
  storeState = {
    lists: LISTS,
    tasks: TASKS,
    labels: [{ id: 'l1', name: 'Urgent', colorKey: 'red', order: 0, createdAt: ts() }],
    filters: EMPTY_BOARD_FILTERS,
    draggingId: null,
    setDraggingId: vi.fn(),
    clearFilters: vi.fn(),
    addTask: vi.fn(async () => task({ id: 'new' })),
  }
})

describe('BoardView', () => {
  it('renders each task in the column matching its listId', () => {
    render(<BoardView />)

    const backlog = screen.getByText('Backlog').closest('div')!.parentElement!
    const selesai = screen.getByText('Selesai').closest('div')!.parentElement!

    expect(within(backlog).getByText('Task A')).toBeInTheDocument()
    expect(within(backlog).getByText('Task B')).toBeInTheDocument()
    expect(within(selesai).getByText('Task C')).toBeInTheDocument()
    expect(within(backlog).queryByText('Task C')).toBeNull()
  })

  it('shows no priority dot for a low-priority task', () => {
    render(<BoardView />)
    // Task A (high) has a priority dot; Task B (low) does not.
    const cardA = screen.getByText('Task A').closest('.rounded-lg')!
    const cardB = screen.getByText('Task B').closest('.rounded-lg')!
    expect(cardA.querySelector('[role="img"]')).not.toBeNull()
    expect(cardB.querySelector('[role="img"]')).toBeNull()
  })

  it('names the active filter in the empty state when nothing matches', () => {
    storeState.filters = { ...EMPTY_BOARD_FILTERS, labelIds: ['l1'] } // no task has label l1
    render(<BoardView />)

    expect(screen.getByText(/tidak ada tugas yang cocok dengan filter/i)).toHaveTextContent('Urgent')
    expect(screen.getByRole('button', { name: /hapus filter/i })).toBeInTheDocument()
  })
})

// Cross-column card drag is verified MANUALLY — jsdom can't hit-test
// (`document.elementFromPoint` + `getBoundingClientRect` return zeros), so
// `useDragSort`'s pointer path can't resolve a target column here.
