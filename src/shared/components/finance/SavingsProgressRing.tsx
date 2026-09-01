'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import { formatPercent } from '@/shared/lib/format'

interface SavingsProgressRingProps {
  /** 0-100. Values above 100 fill the ring completely. */
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  className?: string
}

export function SavingsProgressRing({
  percent,
  size = 96,
  strokeWidth = 8,
  color = '#8B5CF6',
  label,
  className,
}: SavingsProgressRingProps) {
  const reduceMotion = useReducedMotion()
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`${formatPercent(clamped)} tercapai`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduceMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-display text-lg font-bold">{formatPercent(clamped)}</span>
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  )
}
