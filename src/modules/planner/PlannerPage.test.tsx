import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Stub the stores so the page renders without Firebase.
const addTask = vi.fn(async () => ({
  id: 't1',
  title: 'Review PRD',
  notes: null,
  status: 'todo',
  priority: 'high',
  dueAt: null,
  doneAt: null,
  source: 'web',
}))
const setDue = vi.fn(async () => {})
const plannerState = {
  tasks: [],
  isLoading: false,
  subscribe: () => () => {},
  addTask,
  setDue,
  setStatus: vi.fn(),
  removeTask: vi.fn(),
}

vi.mock('@/shared/stores/planner.store', () => ({
  usePlannerStore: Object.assign((selector: (s: typeof plannerState) => unknown) => selector(plannerState), {
    getState: () => plannerState,
  }),
}))

vi.mock('@/shared/stores/auth.store', () => {
  const authState = { profile: { timezone: 'Asia/Jakarta' }, user: { uid: 'u1' } }
  return {
    useAuthStore: Object.assign(
      (selector: (s: typeof authState) => unknown) => selector(authState),
      { getState: () => authState },
    ),
  }
})

import { PlannerPage } from './PlannerPage'

describe('PlannerPage quick-add', () => {
  it('parses the "when" tokens and priority out of the title before calling addTask', async () => {
    render(<PlannerPage />)

    const input = screen.getByPlaceholderText(/tambah tugas/i)
    fireEvent.change(input, { target: { value: 'Review PRD besok jam 3 sore !high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }))

    await waitFor(() =>
      expect(addTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Review PRD', priority: 'high', source: 'web' }),
      ),
    )
    // "besok jam 3 sore" is a parseable due date, so the new task's id gets a due write.
    await waitFor(() => expect(setDue).toHaveBeenCalledWith('t1', expect.any(Date), [0, 60]))
  })
})
