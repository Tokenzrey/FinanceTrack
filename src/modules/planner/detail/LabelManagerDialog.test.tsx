import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'

import type { Label } from '@/shared/types/board'

// ─── Mocks ───
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

let storeState: {
  labels: Label[]
  createLabel: ReturnType<typeof vi.fn>
  updateLabel: ReturnType<typeof vi.fn>
  deleteLabel: ReturnType<typeof vi.fn>
}

vi.mock('@/shared/stores/planner.store', () => ({
  usePlannerStore: Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}))

import { LabelManagerDialog } from './LabelManagerDialog'

const ts = () => Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))

const open = () => render(<LabelManagerDialog open onOpenChange={vi.fn()} />)

beforeEach(() => {
  storeState = {
    labels: [{ id: 'l1', name: 'Urgent', colorKey: 'red', order: 1000, createdAt: ts() }],
    createLabel: vi.fn(async () => {}),
    updateLabel: vi.fn(async () => {}),
    deleteLabel: vi.fn(async () => {}),
  }
})

describe('LabelManagerDialog', () => {
  it('lists the board labels', () => {
    open()
    expect(screen.getByRole('button', { name: 'Urgent' })).toBeInTheDocument()
  })

  it('shows the empty state when the board has no labels', () => {
    storeState.labels = []
    open()
    expect(screen.getByText(/belum ada label\./i)).toBeInTheDocument()
  })

  it('creates a label from the add row with the picked colour', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Label baru warna teal' }))
    fireEvent.change(screen.getByLabelText('Nama label baru'), { target: { value: 'Riset' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }))

    expect(storeState.createLabel).toHaveBeenCalledWith('Riset', 'teal')
  })

  it('disables "Tambah" until a name is typed', () => {
    open()
    expect(screen.getByRole('button', { name: 'Tambah' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Nama label baru'), { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: 'Tambah' })).not.toBeDisabled()
  })

  it('recolours an existing label from its swatch row', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Urgent warna violet' }))

    expect(storeState.updateLabel).toHaveBeenCalledWith('l1', { colorKey: 'violet' })
  })

  it('renames an existing label on Enter', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }))
    const input = screen.getByLabelText('Nama label Urgent')
    fireEvent.change(input, { target: { value: 'Penting' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(storeState.updateLabel).toHaveBeenCalledWith('l1', { name: 'Penting' })
  })

  it('deletes only after the inline confirm', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Hapus label Urgent' }))
    expect(storeState.deleteLabel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ya' }))
    expect(storeState.deleteLabel).toHaveBeenCalledWith('l1')
  })
})
