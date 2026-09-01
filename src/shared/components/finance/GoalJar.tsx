'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { formatPercent } from '@/shared/lib/format'

/** A jar that fills like liquid as a goal's progress rises — the plan's alternative to the progress ring. */
export function GoalJar({
  percent,
  size = 72,
  color = '#8B5CF6',
}: {
  percent: number
  size?: number
  color?: string
}) {
  const reduceMotion = useReducedMotion()
  const clamped = Math.min(100, Math.max(0, percent))

  const jarTop = 14
  const jarBottom = 92
  const jarHeight = jarBottom - jarTop
  const fillY = jarBottom - (clamped / 100) * jarHeight

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Toples terisi ${formatPercent(clamped)}`}
    >
      <defs>
        <clipPath id={`jar-clip-${color.replace('#', '')}`}>
          <path d="M28 14 H72 V22 C72 26 76 28 76 34 V88 C76 90 74 92 72 92 H28 C26 92 24 90 24 88 V34 C24 28 28 26 28 22 Z" />
        </clipPath>
      </defs>

      {/* Jar outline */}
      <path
        d="M28 14 H72 V22 C72 26 76 28 76 34 V88 C76 90 74 92 72 92 H28 C26 92 24 90 24 88 V34 C24 28 28 26 28 22 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-muted-foreground/40"
      />
      {/* Lid */}
      <rect x={26} y={8} width={48} height={8} rx={2} fill="currentColor" className="text-muted-foreground/40" />

      {/* Liquid fill, clipped to the jar's silhouette */}
      <g clipPath={`url(#jar-clip-${color.replace('#', '')})`}>
        <motion.rect
          x={22}
          width={56}
          height={jarHeight + 10}
          fill={color}
          fillOpacity={0.75}
          initial={reduceMotion ? false : { y: jarBottom }}
          animate={{ y: fillY }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </g>

      <text x={50} y={56} textAnchor="middle" className="fill-current text-[16px] font-bold" fill="currentColor">
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}
