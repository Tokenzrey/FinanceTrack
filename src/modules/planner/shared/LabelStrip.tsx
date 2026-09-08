import { cn } from '@/shared/lib/utils'
import type { Label } from '@/shared/types/board'
import { LABEL_COLORS } from '@/shared/types/board'

/** Thin colour bar that sits on top of a card — one equal-width segment per label.
 *  Purely decorative; label names are shown as text elsewhere. */
export function LabelStrip({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null

  return (
    <div aria-hidden className="flex h-[3px] w-full overflow-hidden rounded-t">
      {labels.map((label) => (
        <LabelSegment key={label.id} colorKey={label.colorKey} />
      ))}
    </div>
  )
}

/**
 * `LABEL_COLORS` gives a `light`/`dark` pair of plain Tailwind classes (no `dark:`
 * prefix). The rest of the app themes via CSS-var tokens, so there is no `dark:`
 * machinery to hook into. We instead render both fills and let two literal
 * `dark:hidden` / `dark:block` toggles (which Tailwind can see and emit) pick one.
 */
function LabelSegment({ colorKey }: { colorKey: Label['colorKey'] }) {
  const { light, dark } = LABEL_COLORS[colorKey]
  return (
    <span className="flex flex-1">
      <span className={cn('flex-1 dark:hidden', light)} />
      <span className={cn('hidden flex-1 dark:block', dark)} />
    </span>
  )
}
