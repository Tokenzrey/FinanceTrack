'use client'

import { useState } from 'react'
import { BellRing, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Reminder, ReminderFreq } from '@/shared/types/productivity'

const FREQ_LABELS: Record<ReminderFreq, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  weekday: 'Hari kerja',
}

function UpcomingRow({ reminder, tz }: { reminder: Reminder; tz: string }) {
  const cancelReminderById = usePlannerStore((s) => s.cancelReminderById)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      await cancelReminderById(reminder.id)
      toast.success('Pengingat dibatalkan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membatalkan pengingat')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{reminder.message}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(reminder.remindAt.toDate(), tz)}
          </p>
        </div>
        {reminder.recurrence && (
          <Badge variant="secondary" className="shrink-0">
            {FREQ_LABELS[reminder.recurrence.freq]}
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() => void cancel()}
        >
          Batalkan
        </Button>
      </CardContent>
    </Card>
  )
}

/** Collapsible reminder view for the Tugas page: upcoming (cancellable) + a read-only
 *  "failed" list. Fed by the planner store's `reminders` slice (`reminders.watch`). */
export function RemindersPanel() {
  const reminders = usePlannerStore((s) => s.reminders)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const [open, setOpen] = useState(false)

  const upcoming = reminders
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.remindAt.toMillis() - b.remindAt.toMillis())
  const failed = reminders.filter((r) => r.status === 'failed')

  return (
    <section className="space-y-3 border-t pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold"
      >
        <BellRing className="size-4" aria-hidden />
        Pengingat
        <Badge variant="secondary">{upcoming.length}</Badge>
        <ChevronDown
          className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Mendatang</p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada pengingat mendatang.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li key={r.id}>
                    <UpcomingRow reminder={r} tz={tz} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Gagal terkirim</p>
            {failed.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada pengingat yang gagal.</p>
            ) : (
              <ul className="space-y-2">
                {failed.map((r) => (
                  <li key={r.id}>
                    <Card>
                      <CardContent className="space-y-1 p-3">
                        <p className="truncate text-sm font-medium">{r.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(r.remindAt.toDate(), tz)}
                        </p>
                        {r.lastError && <p className="text-xs text-destructive">{r.lastError}</p>}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
