'use client'

import { Check, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import type { ScanStage } from '@/shared/use-cases/receipt-scanner/ScanReceipt.usecase'

const STAGES: { key: ScanStage; label: string }[] = [
  { key: 'compressing', label: 'Menyiapkan gambar' },
  { key: 'uploading', label: 'Mengunggah struk' },
  { key: 'reading', label: 'AI membaca struk' },
  { key: 'mapping', label: 'Mencocokkan kategori' },
]

export function ScanProgressOverlay({ stage }: { stage: ScanStage | null }) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage)
  // 'done' is past the last listed stage.
  const currentIndex = stage === 'done' ? STAGES.length : activeIndex

  return (
    <div className="space-y-5 py-4" aria-live="polite" aria-busy>
      <div className="flex justify-center">
        <motion.span
          className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </motion.span>
      </div>

      <ol className="space-y-2.5">
        {STAGES.map((item, index) => {
          const done = index < currentIndex
          const active = index === currentIndex

          return (
            <li key={item.key} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                  done && 'border-safe bg-safe text-white',
                  active && 'border-primary text-primary',
                  !done && !active && 'text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : active ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  active ? 'font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="text-center text-xs text-muted-foreground">Biasanya selesai dalam 5–7 detik.</p>
    </div>
  )
}
