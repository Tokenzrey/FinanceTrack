import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TransactionItem } from '@/shared/types/domain'
import { ItemsEditor } from './ItemsEditor'

const rows: TransactionItem[] = [
  { name: 'Kopi', qty: 1, price: 25000 },
  { name: 'Roti', qty: 2, price: 18000 },
]

describe('ItemsEditor', () => {
  it('adds a blank row', () => {
    const onChange = vi.fn()
    render(<ItemsEditor items={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /tambah baris/i }))
    expect(onChange).toHaveBeenCalledWith([{ name: '', qty: 1, price: 0 }])
  })

  it('removes the row at its index', () => {
    const onChange = vi.fn()
    render(<ItemsEditor items={rows} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hapus baris 1' }))
    expect(onChange).toHaveBeenCalledWith([{ name: 'Roti', qty: 2, price: 18000 }])
  })

  it('edits a name in place', () => {
    const onChange = vi.fn()
    render(<ItemsEditor items={rows} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('Kopi'), { target: { value: 'Espresso' } })
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Espresso', qty: 1, price: 25000 },
      { name: 'Roti', qty: 2, price: 18000 },
    ])
  })

  it('floors qty to a whole ≥ 1', () => {
    const onChange = vi.fn()
    render(<ItemsEditor items={rows} onChange={onChange} />)
    const qty = screen.getAllByDisplayValue('1')[0]
    fireEvent.change(qty, { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Kopi', qty: 1, price: 25000 },
      { name: 'Roti', qty: 2, price: 18000 },
    ])
  })
})
