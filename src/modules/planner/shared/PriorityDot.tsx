import { cn } from '@/shared/lib/utils'
import type { TaskPriority } from '@/shared/types/productivity'

/** 6px priority dot. `low` renders nothing (no ink for the common case). */
export function PriorityDot({ priority }: { priority: TaskPriority }) {
  if (priority === 'low') return null

  const label = priority === 'high' ? 'Prioritas tinggi' : 'Prioritas sedang'

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        priority === 'high' ? 'bg-destructive' : 'bg-foreground/40',
      )}
    />
  )
}
