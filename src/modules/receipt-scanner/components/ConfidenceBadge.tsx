import { cn } from '@/shared/lib/utils'
import { confidenceBand } from '@/shared/types/receipt-scanner.types'

const BAND_CLASS = {
  high: 'bg-safe/15 text-safe border-safe/30',
  medium: 'bg-warning/15 text-warning border-warning/30',
  low: 'bg-exceeded/15 text-exceeded border-exceeded/30',
} as const

const BAND_LABEL = {
  high: 'Yakin',
  medium: 'Cukup yakin',
  low: 'Perlu dicek',
} as const

/**
 * AI confidence, green ≥80 / yellow 50–79 / red <50.
 * The number and a word both appear — the colour alone never carries the meaning.
 */
export function ConfidenceBadge({
  confidence,
  showLabel = false,
  className,
}: {
  confidence: number
  showLabel?: boolean
  className?: string
}) {
  const band = confidenceBand(confidence)

  return (
    <span
      className={cn(
        'tabular inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        BAND_CLASS[band],
        className,
      )}
      title={`Keyakinan AI: ${Math.round(confidence)}% — ${BAND_LABEL[band]}`}
    >
      {showLabel && <span>{BAND_LABEL[band]}</span>}
      {Math.round(confidence)}%
    </span>
  )
}
