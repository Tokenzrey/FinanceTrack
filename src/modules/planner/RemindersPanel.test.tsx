import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

const cancelReminderById = vi.fn(async () => {})
const createStandaloneReminder = vi.fn<(dto: unknown) => Promise<void>>(async () => {})
const openTask = vi.fn()

// Fixtures are relative to real `Date.now()` so the panel's internal `new Date()`
// buckets them deterministically whenever the suite runs.
const inHours = (h: number) => Timestamp.fromDate(new Date(Date.now() + h * 3600_000))

const plannerState = {
  tasks: [],
  reminders: [
    {
      id: 'r1',
      taskId: null,
      message: 'Bayar listrik',
      status: 'pending',
      remindAt: inHours(3), // today
      recurrence: null,
      lastError: null,
    },
    {
      id: 'r2',
      taskId: null,
      message: 'Standup',
      status: 'pending',
      remindAt: inHours(1.5), // today, earlier than r1
      recurrence: { freq: 'weekly', until: null },
      lastError: null,
    },
    {
      id: 'r3',
      taskId: null,
      message: 'Bayar tagihan',
      status: 'failed',
      remindAt: inHours(-24),
      recurrence: null,
      lastError: 'not_linked',
    },
    {
      id: 'r4',
      taskId: null,
      message: 'Sudah lewat',
      status: 'sent',
      remindAt: inHours(-72),
      recurrence: null,
      lastError: null,
    },
  ],
  cancelReminderById,
  createStandaloneReminder,
  openTask,
}

vi.mock('@/shared/stores/planner.store', () => ({
  usePlannerStore: Object.assign(
    (selector: (s: typeof plannerState) => unknown) => selector(plannerState),
    { getState: () => plannerState },
  ),
}))

vi.mock('@/shared/stores/auth.store', () => {
  const authState = { profile: { timezone: 'Asia/Jakarta' } }
  return {
    useAuthStore: Object.assign(
      (selector: (s: typeof authState) => unknown) => selector(authState),
      { getState: () => authState },
    ),
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { RemindersPanel } from './RemindersPanel'

const expand = () => fireEvent.click(screen.getByRole('button', { name: /pengingat/i }))

describe('RemindersPanel', () => {
  it('groups pending reminders under "Hari ini", sorted by remindAt asc; drops sent', () => {
    render(<RemindersPanel />)
    expand()

    expect(screen.getByRole('heading', { name: /hari ini/i })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    // r2 (1.5h) before r1 (3h); r4 'sent' excluded entirely.
    expect(items[0]).toContain('Standup')
    expect(items[1]).toContain('Bayar listrik')
    expect(screen.queryByText('Sudah lewat')).toBeNull()
    expect(screen.getByText('Mingguan')).toBeInTheDocument()
  })

  it('shows a failed reminder under "Gagal terkirim" with its humanized reason', () => {
    render(<RemindersPanel />)
    expand()

    expect(screen.getByRole('heading', { name: /gagal terkirim/i })).toBeInTheDocument()
    expect(screen.getByText('Bayar tagihan')).toBeInTheDocument()
    // Humanized, not the raw code.
    expect(screen.getByText(/belum tertaut/i)).toBeInTheDocument()
    expect(screen.queryByText('not_linked')).toBeNull()
  })

  it('cancels an upcoming reminder through the store action', async () => {
    render(<RemindersPanel />)
    expand()

    fireEvent.click(screen.getAllByRole('button', { name: 'Batalkan' })[0])
    await waitFor(() => expect(cancelReminderById).toHaveBeenCalledWith('r2'))
  })

  it('"Jadwalkan ulang" creates a fresh reminder from the failed one, fired in the future', async () => {
    render(<RemindersPanel />)
    expand()

    fireEvent.click(screen.getByRole('button', { name: 'Jadwalkan ulang' }))

    await waitFor(() => expect(createStandaloneReminder).toHaveBeenCalledTimes(1))
    const dto = createStandaloneReminder.mock.calls[0][0] as unknown as {
      message: string
      remindAt: Date
      source: string
    }
    expect(dto).toEqual(
      expect.objectContaining({ message: 'Bayar tagihan', source: 'web' }),
    )
    expect(dto.remindAt.getTime()).toBeGreaterThan(Date.now())
  })
})
