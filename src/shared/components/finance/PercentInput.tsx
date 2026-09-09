'use client'

import { forwardRef, useEffect, useState } from 'react'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

interface PercentInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  /** Percent as a plain number, e.g. `33.3`. */
  value: number
  onChange: (value: number) => void
  /** Clamp bounds; defaults to 0–100. */
  min?: number
  max?: number
  /** Decimal places to keep on blur. Typing is unrestricted; this only tidies. */
  precision?: number
}

/** Accepts "33", "33.3", "33,3" — one comma or dot, digits only otherwise. */
function parsePercent(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * A precise stand-in for a percentage slider. Holds the display string in local
 * state so a half-typed "33." doesn't snap; commits a clamped, rounded number to
 * the parent on change and tidies to `precision` places on blur.
 */
export const PercentInput = forwardRef<HTMLInputElement, PercentInputProps>(function PercentInput(
  { value, onChange, className, min = 0, max = 100, precision = 1, ...props },
  ref,
) {
  const [text, setText] = useState(() => String(value))

  // Reflect an external change (slider drag, form reset) without clobbering an
  // in-progress edit — only when the numeric values actually diverge.
  useEffect(() => {
    if (parsePercent(text) !== value) setText(String(value))
    // `text` intentionally omitted: this syncs *from* the parent, not the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(clamp(parsePercent(e.target.value)))
        }}
        onBlur={(e) => {
          const n = clamp(parsePercent(e.target.value))
          const tidy = Number(n.toFixed(precision))
          setText(String(tidy))
          onChange(tidy)
          props.onBlur?.(e)
        }}
        className={cn('tabular pr-7 text-right', className)}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  )
})
