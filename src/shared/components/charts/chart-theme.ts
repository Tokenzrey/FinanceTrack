'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import type { Pillar } from '@/shared/types/domain'

/**
 * Chart colours are validated per mode, not flipped.
 *
 * Both sets were checked with the dataviz palette validator against their own surface:
 *   light (surface #FFFFFF) — all checks pass; contrast is below 3:1, which obliges
 *     visible labels, satisfied by the direct value labels and the category table.
 *   dark  (surface #1E293B) — the light teal/orange sit above the L 0.48–0.67 band,
 *     so dark uses its own darker steps. All checks pass with no warning.
 *
 * Do not "simplify" these to one set: the light values FAIL the dark lightness band.
 */
export const CHART_COLORS = {
  light: {
    income: '#F59E0B',
    needs: '#14B8A6',
    wants: '#F97316',
    savings: '#8B5CF6',
  },
  dark: {
    income: '#D97706',
    needs: '#0D9488',
    wants: '#EA580C',
    savings: '#8B5CF6',
  },
} satisfies Record<'light' | 'dark', Record<Pillar, string>>

/**
 * Cash-flow triad: income vs total spending vs savings.
 *
 * Spending here is the aggregate, NOT the "wants" pillar, so it does not reuse the
 * pillar orange — and could not anyway: gold against pillar-orange measures ΔE 9.6 in
 * normal vision, under the 15 floor, so full-colour readers cannot separate the pair.
 * Rose clears every check in both modes. Validated; do not swap back to the pillar hue.
 */
export const FLOW_COLORS = {
  light: { income: '#F59E0B', spending: '#E11D48', saved: '#8B5CF6' },
  dark: { income: '#D97706', spending: '#E11D48', saved: '#8B5CF6' },
} as const

/** Grid, axis and reference-line ink. Recessive by design — never competes with the marks. */
export const CHART_INK = {
  light: { grid: '#E2E8F0', axis: '#94A3B8', label: '#475569', surface: '#FFFFFF' },
  dark: { grid: '#334155', axis: '#64748B', label: '#94A3B8', surface: '#1E293B' },
}

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Charts render on the server too; commit to light until the real theme is known.
  useEffect(() => setMounted(true), [])

  const mode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  return {
    mode,
    colors: CHART_COLORS[mode],
    flow: FLOW_COLORS[mode],
    ink: CHART_INK[mode],
    /** 2px surface-coloured gap between stacked segments and adjacent bars. */
    gapStroke: CHART_INK[mode].surface,
  }
}
