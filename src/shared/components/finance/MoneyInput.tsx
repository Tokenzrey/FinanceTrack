'use client'

import { forwardRef, useEffect, useState } from 'react'
import { Calculator } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { formatNumber, parseIDR } from '@/shared/lib/format'
import { AmountNumpad } from './AmountNumpad'

interface MoneyInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: number
  onChange: (value: number) => void
  /** Set false to hide the numpad trigger — e.g. a field too narrow for the extra icon. */
  numpad?: boolean
}

/**
 * IDR amount field. Shows "1.500.000" while holding a plain number in state, so
 * forms never have to parse a formatted string back.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className, numpad = true, ...props },
  ref,
) {
  const [text, setText] = useState(() => (value ? formatNumber(value) : ''))
  const [numpadOpen, setNumpadOpen] = useState(false)

  // Reformat when the value is changed from outside (form reset, AI scan result).
  useEffect(() => {
    setText(value ? formatNumber(value) : '')
  }, [value])

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        Rp
      </span>
      <Input
        {...props}
        ref={ref}
        // `inputMode` gives phones the numeric pad without blocking paste of a formatted amount.
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const parsed = parseIDR(event.target.value)
          setText(parsed ? formatNumber(parsed) : '')
          onChange(parsed)
        }}
        className={cn('tabular pl-9 text-right', numpad && 'pr-9', className)}
      />
      {numpad && (
        <button
          type="button"
          onClick={() => setNumpadOpen(true)}
          className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Buka numpad"
        >
          <Calculator className="size-4" aria-hidden />
        </button>
      )}
      {numpad && (
        <AmountNumpad
          open={numpadOpen}
          onOpenChange={setNumpadOpen}
          initialValue={value}
          onConfirm={onChange}
        />
      )}
    </div>
  )
})
