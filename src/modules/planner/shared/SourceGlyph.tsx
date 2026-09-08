import { MessageCircle, Send, MonitorSmartphone } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip'
import type { EntrySource } from '@/shared/types/productivity'

const GLYPHS: Record<EntrySource, { Icon: typeof MessageCircle; label: string }> = {
  whatsapp: { Icon: MessageCircle, label: 'Dari WhatsApp' },
  telegram: { Icon: Send, label: 'Dari Telegram' },
  web: { Icon: MonitorSmartphone, label: 'Dibuat di web' },
}

/** Tiny provenance icon with a tooltip naming where the entry came from. */
export function SourceGlyph({ source }: { source: EntrySource }) {
  const { Icon, label } = GLYPHS[source]
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex text-muted-foreground" aria-label={label}>
            <Icon className="h-3 w-3" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
