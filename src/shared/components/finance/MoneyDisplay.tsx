'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import { formatIDR, formatIDRCompact } from '@/shared/lib/format'

interface MoneyDisplayProps {
  value: number
  /** Count up from the previous value on change. Off inside tables and long lists. */
  animated?: boolean
  compact?: boolean
  showCents?: boolean
  /** Colour negatives red and positives green — for cash-flow figures, not budgets. */
  signed?: boolean
  className?: string
}

const DURATION = 0.6

export function MoneyDisplay({
  value,
  animated = false,
  compact = false,
  showCents = false,
  signed = false,
  className,
}: MoneyDisplayProps) {
  const reduceMotion = useReducedMotion()
  const [displayed, setDisplayed] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    if (!animated || reduceMotion) {
      setDisplayed(value)
      previous.current = value
      return
    }

    const controls = animate(previous.current, value, {
      duration: DURATION,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplayed(latest),
    })

    previous.current = value
    return () => controls.stop()
  }, [value, animated, reduceMotion])

  const text = compact ? formatIDRCompact(displayed) : formatIDR(displayed, showCents)

  return (
    <span
      className={cn(
        'tabular',
        signed && value < 0 && 'text-exceeded',
        signed && value > 0 && 'text-safe',
        className,
      )}
      // The animated text changes every frame; announce only the settled value.
      aria-label={formatIDR(value, showCents)}
    >
      {text}
    </span>
  )
}
