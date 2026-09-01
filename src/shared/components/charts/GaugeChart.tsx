'use client'

import { motion, useReducedMotion } from 'framer-motion'

/**
 * A semi-circle 0-100 gauge, hand-drawn with SVG arcs.
 *
 * No charting library needed for one arc — this is the actual reusable `GaugeChart`
 * primitive the plan asked for under Sprint 1's chart-wrapper library, usable anywhere
 * a single 0-100 score needs a dial rather than a bar (efficiency scores, health score).
 */
export function GaugeChart({
  value,
  size = 96,
  color = '#14B8A6',
  trackColor,
  label,
}: {
  /** 0-100. */
  value: number
  size?: number
  color?: string
  trackColor?: string
  label?: string
}) {
  const reduceMotion = useReducedMotion()
  const clamped = Math.min(100, Math.max(0, value))

  const strokeWidth = size * 0.12
  const radius = size / 2 - strokeWidth
  const cx = size / 2
  const cy = size / 2
  // A semicircle from 180deg to 0deg (left to right along the top).
  const circumference = Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`

  return (
    <div className="inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + strokeWidth / 2} viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}>
        <path
          d={arcPath}
          fill="none"
          stroke={trackColor ?? 'currentColor'}
          strokeOpacity={trackColor ? 1 : 0.12}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <motion.path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduceMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
      <span className="tabular -mt-3 text-lg font-bold">{Math.round(clamped)}</span>
      {label && <span className="text-center text-[10px] text-muted-foreground">{label}</span>}
    </div>
  )
}
