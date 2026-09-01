'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { formatDay } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { GoalContribution, SavingsGoal } from '@/shared/types/domain'

/** Riwayat setoran — every deposit ever made toward one goal, newest first. */
export function ContributionTimeline({
  goal,
  onOpenChange,
}: {
  goal: SavingsGoal | null
  onOpenChange: (open: boolean) => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!goal || !userId) return
    setLoading(true)
    repositories.goals
      .findContributions(userId, goal.id)
      .then(setContributions)
      .finally(() => setLoading(false))
  }, [goal, userId])

  if (!goal) return null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden />
            Riwayat setoran — {goal.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : contributions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada setoran tercatat untuk target ini.
          </p>
        ) : (
          <ul className="space-y-2">
            {contributions.map((contribution) => (
              <li
                key={contribution.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatDay(contribution.date.toDate())}</p>
                  {contribution.note && (
                    <p className="truncate text-xs text-muted-foreground">{contribution.note}</p>
                  )}
                </div>
                <MoneyDisplay value={contribution.amount} className="shrink-0 font-semibold text-safe" />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
