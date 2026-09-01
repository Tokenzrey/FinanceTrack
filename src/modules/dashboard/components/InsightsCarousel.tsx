'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import type { Insight } from '@/shared/lib/insights'

const TONE_CLASS = {
  good: 'bg-safe/15 text-safe',
  warn: 'bg-warning/15 text-warning',
  info: 'bg-primary/10 text-primary',
} as const

export function InsightsCarousel({ insights }: { insights: Insight[] }) {
  const [index, setIndex] = useState(0)

  if (insights.length === 0) return null

  const current = insights[Math.min(index, insights.length - 1)]
  const move = (delta: number) =>
    setIndex((value) => (value + delta + insights.length) % insights.length)

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            TONE_CLASS[current.tone],
          )}
        >
          <Lightbulb className="size-4" aria-hidden />
        </span>

        {/* aria-live so a screen reader hears the new card when it changes. */}
        <div className="min-h-[3rem] min-w-0 flex-1" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <p className="text-sm font-medium">{current.title}</p>
              <p className="text-xs text-muted-foreground">{current.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {insights.length > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="tabular mr-1 text-xs text-muted-foreground">
              {index + 1}/{insights.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => move(-1)}
              aria-label="Wawasan sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => move(1)}
              aria-label="Wawasan berikutnya"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
