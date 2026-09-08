import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import type { Label } from '@/shared/types/board'
import type { Reminder, Task } from '@/shared/types/productivity'
import { COL_WIDTH } from '@/shared/lib/timeline-scale'
import { TooltipProvider } from '@/shared/components/ui/tooltip'

// ─── Mocks ───
vi.mock('@/shared/stores/planner.store', () => {
  const state = { openTask: vi.fn() }
  return {
    usePlannerStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

import { TimelineBar } from './TimelineBar'
import { ReminderPin } from './ReminderPin'

// A fixed range start and a task spanning exactly 3 days.
const RANGE_START = new Date('2026-09-07T00:00:00') // Monday, ambient zone
const COL = COL_WIDTH.day // 48
const START = new Date('2026-09-09T09:00:00') // day 2, 09:00
const DUE = new Date('2026-09-12T17:00:00') // day 5, 17:00
const DURATION_MS = DUE.getTime() - START.getTime()

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Tinjau rancangan API',
    notes: null,
    status: 'todo',
    priority: 'med',
    dueAt: Timestamp.fromDate(DUE),
    doneAt: null,
    source: 'web',
    createdAt: Timestamp.fromDate(START),
    updatedAt: Timestamp.fromDate(START),
    startAt: Timestamp.fromDate(START),
    ...over,
  }
}

const LABELS_BY_ID = new Map<string, Label>()

type CommitFn = (patch: { startAt?: Date | null; dueAt?: Date | null }) => void

function renderBar(onCommit: CommitFn, task = makeTask()) {
  return render(
    <TimelineBar
      task={task}
      rangeStart={RANGE_START}
      colWidth={COL}
      zoom="day"
      labelsById={LABELS_BY_ID}
      reminders={[]}
      tz="Asia/Jakarta"
      onCommitSchedule={onCommit}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TimelineBar drag / resize', () => {
  it('body drag moves startAt AND dueAt rigidly (duration constant)', () => {
    const onCommit = vi.fn()
    renderBar(onCommit)

    const bar = screen.getByRole('button', { name: 'Tinjau rancangan API' })
    // Drag right by 2 day-columns.
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100 + 2 * COL })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100 + 2 * COL })

    expect(onCommit).toHaveBeenCalledTimes(1)
    const patch = onCommit.mock.calls[0][0] as { startAt: Date; dueAt: Date }
    expect(patch.startAt).toBeInstanceOf(Date)
    expect(patch.dueAt).toBeInstanceOf(Date)

    // startAt ~2 days later than the original start.
    const dayMs = 86_400_000
    const startShift = patch.startAt.getTime() - START.getTime()
    expect(Math.round(startShift / dayMs)).toBe(2)

    // Duration held exactly.
    expect(patch.dueAt.getTime() - patch.startAt.getTime()).toBe(DURATION_MS)

    // Time-of-day preserved on the moved start.
    expect(patch.startAt.getHours()).toBe(9)
  })

  it('right-handle resize changes ONLY dueAt, later by the drag amount', () => {
    const onCommit = vi.fn()
    const { container } = renderBar(onCommit)

    const rightHandle = container.querySelector('[data-handle="end"]') as HTMLElement
    fireEvent.pointerDown(rightHandle, { pointerId: 2, clientX: 200 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 200 + 2 * COL })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 200 + 2 * COL })

    expect(onCommit).toHaveBeenCalledTimes(1)
    const patch = onCommit.mock.calls[0][0] as { startAt?: Date; dueAt?: Date }
    expect(patch.startAt).toBeUndefined()
    expect(patch.dueAt).toBeInstanceOf(Date)

    const dayMs = 86_400_000
    const dueShift = (patch.dueAt as Date).getTime() - DUE.getTime()
    expect(Math.round(dueShift / dayMs)).toBe(2)
    expect((patch.dueAt as Date).getHours()).toBe(17) // due time-of-day kept
  })

  it('left-handle resize changes ONLY startAt', () => {
    const onCommit = vi.fn()
    const { container } = renderBar(onCommit)

    const leftHandle = container.querySelector('[data-handle="start"]') as HTMLElement
    fireEvent.pointerDown(leftHandle, { pointerId: 3, clientX: 50 })
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 50 - 1 * COL })
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 50 - 1 * COL })

    expect(onCommit).toHaveBeenCalledTimes(1)
    const patch = onCommit.mock.calls[0][0] as { startAt?: Date; dueAt?: Date }
    expect(patch.dueAt).toBeUndefined()
    expect(patch.startAt).toBeInstanceOf(Date)

    const dayMs = 86_400_000
    const startShift = (patch.startAt as Date).getTime() - START.getTime()
    expect(Math.round(startShift / dayMs)).toBe(-1)
  })

  it('a plain click (no move past threshold) does not commit', () => {
    const onCommit = vi.fn()
    renderBar(onCommit)
    const bar = screen.getByRole('button', { name: 'Tinjau rancangan API' })
    fireEvent.pointerDown(bar, { pointerId: 4, clientX: 100 })
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 102 }) // 2px < 6px threshold
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('ReminderPin', () => {
  const baseReminder = (over: Partial<Reminder>): Reminder => ({
    id: 'r1',
    ownerId: 'u1',
    kind: 'task',
    taskId: 't1',
    message: 'Cek progres',
    remindAt: Timestamp.fromDate(new Date('2026-09-10T14:30:00')),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    recurrence: null,
    source: 'web',
    createdAt: Timestamp.fromDate(START),
    updatedAt: Timestamp.fromDate(START),
    ...over,
  })

  function renderPin(r: Reminder) {
    return render(
      <TooltipProvider>
        <ReminderPin
          reminder={r}
          rangeStart={RANGE_START}
          colWidth={COL}
          zoom="day"
          tz="Asia/Jakarta"
        />
      </TooltipProvider>,
    )
  }

  it('renders an empty destructive ring (not a filled dot) for a failed reminder', () => {
    renderPin(baseReminder({ status: 'failed' }))
    const pin = screen.getByLabelText(/gagal terkirim/)
    expect(pin.className).toContain('border-destructive')
    expect(pin.className).not.toContain('bg-primary')
  })

  it('renders a filled primary dot for a pending reminder', () => {
    renderPin(baseReminder({ status: 'pending' }))
    const pin = screen.getByLabelText(/^Pengingat 14\.30/)
    expect(pin.className).toContain('bg-primary')
    expect(pin.className).not.toContain('border-destructive')
  })
})
