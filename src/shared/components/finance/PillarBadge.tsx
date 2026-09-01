import { cn } from '@/shared/lib/utils'
import { PILLAR_LABELS, type Pillar } from '@/shared/types/domain'

/** One place mapping a pillar to its colour, so charts, badges and dots never disagree. */
export const PILLAR_CLASSES: Record<
  Pillar,
  { badge: string; dot: string; text: string; hex: string }
> = {
  income: {
    badge: 'bg-income/15 text-income border-income/30',
    dot: 'bg-income',
    text: 'text-income',
    hex: '#F59E0B',
  },
  needs: {
    badge: 'bg-needs/15 text-needs border-needs/30',
    dot: 'bg-needs',
    text: 'text-needs',
    hex: '#14B8A6',
  },
  wants: {
    badge: 'bg-wants/15 text-wants border-wants/30',
    dot: 'bg-wants',
    text: 'text-wants',
    hex: '#F97316',
  },
  savings: {
    badge: 'bg-savings/15 text-savings border-savings/30',
    dot: 'bg-savings',
    text: 'text-savings',
    hex: '#8B5CF6',
  },
}

export function PillarBadge({ pillar, className }: { pillar: Pillar; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        PILLAR_CLASSES[pillar].badge,
        className,
      )}
    >
      {PILLAR_LABELS[pillar]}
    </span>
  )
}

export function PillarColorDot({ pillar, className }: { pillar: Pillar; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        PILLAR_CLASSES[pillar].dot,
        className,
      )}
    />
  )
}
