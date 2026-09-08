import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import type { BoardList, BoardFilters, Label } from '@/shared/types/board'
import { EMPTY_BOARD_FILTERS } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'

// ─── Mocks ───
const { toggleChecklistItem } = vi.hoisted(() => ({ toggleChecklistItem: vi.fn() }))
vi.mock('@/shared/use-cases/board/ToggleChecklistItem.usecase', () => ({ toggleChecklistItem }))
vi.mock('@/shared/use-cases/board/AddChecklistItem.usecase', () => ({ addChecklistItem: vi.fn() }))
vi.mock('@/shared/use-cases/board/ReorderChecklistItem.usecase', () => ({ reorderChecklistItem: vi.fn() }))
vi.mock('@/shared/use-cases/board/AddAttachment.usecase', () => ({ addAttachment: vi.fn() }))
vi.mock('@/shared/use-cases/board/AddProgressNote.usecase', () => ({ addProgressNote: vi.fn() }))
vi.mock('@/shared/use-cases/board/SetTaskSchedule.usecase', () => ({ setTaskSchedule: vi.fn() }))
vi.mock('@/shared/use-cases/board/MoveTask.usecase', () => ({ moveTask: vi.fn() }))
vi.mock('@/shared/repositories', () => ({
  repositories: { tasks: { update: vi.fn(async () => {}) } },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// The panel branches on this — the test flips it per-case.
const isDesktop = { value: true }
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useIsDesktop: () => isDesktop.value,
  useMediaQuery: () => isDesktop.value,
}))

const ts = () => Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))

const TASK: Task = {
  id: 't1',
  title: 'Tinjau PRD',
  notes: null,
  status: 'doing',
  priority: 'med',
  dueAt: null,
  doneAt: null,
  source: 'web',
  createdAt: ts(),
  updatedAt: ts(),
  listId: 'c1',
  order: 1000,
  checklist: [
    { id: 'i1', title: 'Item satu', done: false, order: 1000 },
    { id: 'i2', title: 'Item dua', done: false, order: 2000 },
  ],
}

const LISTS: BoardList[] = [
  {
    id: 'c1',
    title: 'Backlog',
    order: 1000,
    mapsToStatus: 'todo',
    wipLimit: null,
    isCollapsed: false,
    createdAt: ts(),
    updatedAt: ts(),
  },
]

let storeState: {
  detailTaskId: string | null
  tasks: Task[]
  lists: BoardList[]
  labels: Label[]
  reminders: unknown[]
  filters: BoardFilters
  closeTask: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
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

import { TaskDetailPanel } from './TaskDetailPanel'

beforeEach(() => {
  toggleChecklistItem.mockReset().mockResolvedValue(undefined)
  isDesktop.value = true
  storeState = {
    detailTaskId: 't1',
    tasks: [TASK],
    lists: LISTS,
    labels: [],
    reminders: [],
    filters: EMPTY_BOARD_FILTERS,
    closeTask: vi.fn(),
    setStatus: vi.fn(async () => {}),
  }
})

describe('TaskDetailPanel', () => {
  it('ticking a checklist item calls toggleChecklistItem with the right task.id + itemId', () => {
    render(<TaskDetailPanel />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Item satu' }))

    expect(toggleChecklistItem).toHaveBeenCalledTimes(1)
    expect(toggleChecklistItem).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 't1' }), 'i1')
  })

  it('renders a Drawer, not a Dialog, below lg', () => {
    isDesktop.value = false
    render(<TaskDetailPanel />)

    expect(screen.getByTestId('task-detail-drawer')).toBeInTheDocument()
    expect(screen.queryByTestId('task-detail-dialog')).toBeNull()
  })

  it('renders a Dialog, not a Drawer, at >= lg', () => {
    isDesktop.value = true
    render(<TaskDetailPanel />)

    expect(screen.getByTestId('task-detail-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('task-detail-drawer')).toBeNull()
  })

  it('renders nothing when detailTaskId is null', () => {
    storeState.detailTaskId = null
    const { container } = render(<TaskDetailPanel />)
    expect(container).toBeEmptyDOMElement()
  })
})
