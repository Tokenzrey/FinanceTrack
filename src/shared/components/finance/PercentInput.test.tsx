import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PercentInput } from './PercentInput'

describe('PercentInput', () => {
  it('parses a comma or dot decimal and reports the number', () => {
    const onChange = vi.fn()
    render(<PercentInput value={0} onChange={onChange} aria-label="pct" />)
    const field = screen.getByLabelText('pct')

    fireEvent.change(field, { target: { value: '33,3' } })
    expect(onChange).toHaveBeenLastCalledWith(33.3)

    fireEvent.change(field, { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith(12.5)
  })

  it('clamps to the given bounds on the fly', () => {
    const onChange = vi.fn()
    render(<PercentInput value={0} onChange={onChange} min={0} max={60} aria-label="pct" />)
    const field = screen.getByLabelText('pct')

    fireEvent.change(field, { target: { value: '250' } })
    expect(onChange).toHaveBeenLastCalledWith(60)
  })

  it('tidies to `precision` decimals on blur', () => {
    const onChange = vi.fn()
    render(<PercentInput value={0} onChange={onChange} precision={1} aria-label="pct" />)
    const field = screen.getByLabelText('pct') as HTMLInputElement

    fireEvent.change(field, { target: { value: '33.33333' } })
    fireEvent.blur(field)
    expect(field.value).toBe('33.3')
    expect(onChange).toHaveBeenLastCalledWith(33.3)
  })

  it('reflects an external value change without wiping an equal in-progress string', () => {
    const { rerender } = render(<PercentInput value={20} onChange={vi.fn()} aria-label="pct" />)
    const field = screen.getByLabelText('pct') as HTMLInputElement
    expect(field.value).toBe('20')

    rerender(<PercentInput value={45} onChange={vi.fn()} aria-label="pct" />)
    expect(field.value).toBe('45')
  })
})
