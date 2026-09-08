import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

const cancelReminderById = vi.fn(async () => {})

const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
const plannerState = {
  reminders: [
    {
      id: 'r1',
      message: 'Bayar listrik',
      status: 'pending',
      remindAt: ts('2026-09-10T02:00:00Z'),
      recurrence: null,
      lastError: null,
    },
    {
      id: 'r2',
      message: 'Standup',
      status: 'pending',
      remindAt: ts('2026-09-09T02:00:00Z'),
      recurrence: { freq: 'weekly', until: null },
      lastError: null,
    },
    {
      id: 'r3',
      message: 'Kirim laporan',
      status: 'failed',
      remindAt: ts('2026-09-08T02:00:00Z'),
      recurrence: null,
      lastError: 'gowa 500',
    },
    {
      id: 'r4',
      message: 'Sudah lewat',
      status: 'sent',
      remindAt: ts('2026-09-01T02:00:00Z'),
      recurrence: null,
      lastError: null,
    },
  ],
  cancelReminderById,
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
  it('lists only pending reminders under "Mendatang", sorted by remindAt asc', () => {
    render(<RemindersPanel />)
    expand()

    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    // r2 (09-09) before r1 (09-10); r4 'sent' excluded entirely.
    expect(items[0]).toContain('Standup')
    expect(items[1]).toContain('Bayar listrik')
    expect(screen.queryByText('Sudah lewat')).toBeNull()
    expect(screen.getByText('Mingguan')).toBeInTheDocument()
  })

  it('shows failed reminders read-only with their lastError', () => {
    render(<RemindersPanel />)
    expand()

    expect(screen.getByText('Kirim laporan')).toBeInTheDocument()
    expect(screen.getByText('gowa 500')).toBeInTheDocument()
  })

  it('cancels an upcoming reminder through the store action', async () => {
    render(<RemindersPanel />)
    expand()

    fireEvent.click(screen.getAllByRole('button', { name: 'Batalkan' })[0])
    await waitFor(() => expect(cancelReminderById).toHaveBeenCalledWith('r2'))
  })
})
