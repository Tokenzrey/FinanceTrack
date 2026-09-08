'use client'

interface DependencyArrowProps {
  /** Dependent task's bar left-center, px in the overlay coordinate space. */
  from: { x: number; y: number }
  /** Blocker task's bar right-center. */
  to: { x: number; y: number }
  /** True when the blocker's end slips past the dependent's start. */
  conflict: boolean
}

/**
 * Quiet orthogonal elbow connector from a blocker's right edge to the dependent's
 * left edge. `muted-foreground` by default, brightens to `foreground` on hover
 * (an invisible fat hit-path drives the `:hover`), and turns `destructive` when
 * `conflict` — so a schedule clash is visible without being hunted for.
 */
export function DependencyArrow({ from, to, conflict }: DependencyArrowProps) {
  // 3-segment elbow: out from the blocker, vertical at the midpoint, into the dependent.
  const midX = to.x + Math.max((from.x - to.x) / 2, 8)
  const d = `M ${to.x} ${to.y} H ${midX} V ${from.y} H ${from.x}`
  // Small arrowhead at the `from` end, pointing right (into the dependent's edge).
  const head = `${from.x - 4},${from.y - 3} ${from.x},${from.y} ${from.x - 4},${from.y + 3}`

  const stroke = conflict ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))'
  const strokeWidth = conflict ? 1.5 : 1

  return (
    <g
      className={
        conflict
          ? 'pointer-events-auto'
          : 'pointer-events-auto [&:hover_.dep-visible]:stroke-foreground'
      }
    >
      {/* Fat transparent hit area so hovering near the line counts. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
      <path
        className="dep-visible"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <polygon
        className="dep-visible"
        points={head}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  )
}
