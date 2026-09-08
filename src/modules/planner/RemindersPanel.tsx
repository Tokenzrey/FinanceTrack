'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, BellRing, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import {
  groupReminders,
  humanizeReminderError,
  relativeReminderTime,
} from '@/shared/lib/reminder-grouping'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { CreateReminderDTO, Reminder, ReminderFreq } from '@/shared/types/productivity'

const FREQ_LABELS: Record<ReminderFreq, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  weekday: 'Hari kerja',
}

const HOUR_MS = 60 * 60 * 1000

function ReminderRow({ reminder, tz, now }: { reminder: Reminder; tz: string; now: Date }) {
  const cancelReminderById = usePlannerStore((s) => s.cancelReminderById)
  const createStandaloneReminder = usePlannerStore((s) => s.createStandaloneReminder)
  const openTask = usePlannerStore((s) => s.openTask)
  const tasks = usePlannerStore((s) => s.tasks)
  const [busy, setBusy] = useState(false)

  const isFailed = reminder.status === 'failed'
  const absolute = formatDateTime(reminder.remindAt.toDate(), tz)
  const relative = relativeReminderTime(reminder.remindAt.toDate(), now)
  const parentTitle = reminder.taskId
    ? tasks.find((t) => t.id === reminder.taskId)?.title ?? null
    : null

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

  // Creates a FRESH reminder from the failed one's message. Does not delete or retry
  // the failed row — the cron's own backoff owns that. New remindAt is bumped to
  // now + 1h because createReminder rejects past times.
  const reschedule = async () => {
    setBusy(true)
    try {
      const dto: CreateReminderDTO = {
        message: reminder.message,
        remindAt: new Date(now.getTime() + HOUR_MS),
        recurrence: reminder.recurrence
          ? {
              freq: reminder.recurrence.freq,
              until: reminder.recurrence.until?.toDate() ?? null,
            }
          : null,
        source: 'web',
      }
      await createStandaloneReminder(dto)
      toast.success('Pengingat dijadwalkan ulang')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menjadwalkan ulang')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        {isFailed ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {humanizeReminderError(reminder.lastError)}
          </p>
        ) : (
          <p className="text-sm font-medium" title={absolute}>
            {relative}
          </p>
        )}

        <p className="line-clamp-2 text-xs text-muted-foreground">{reminder.message}</p>

        {isFailed && (
          <p className="text-xs text-muted-foreground" title={absolute}>
            Dijadwalkan {relative}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {reminder.recurrence && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {FREQ_LABELS[reminder.recurrence.freq]}
            </Badge>
          )}
          {reminder.taskId && (
            <button
              type="button"
              onClick={() => openTask(reminder.taskId!)}
              className="rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {parentTitle ? `Buka: ${parentTitle}` : 'Buka tugas'}
            </button>
          )}
          {isFailed ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              disabled={busy}
              onClick={() => void reschedule()}
            >
              Jadwalkan ulang
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Batalkan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Collapsible reminder view for the Tugas page. Reminders are grouped by time
 *  proximity (Hari ini · Besok · Minggu ini · Nanti · Gagal terkirim); only
 *  non-empty groups render. Fed by the planner store's `reminders` slice. */
export function RemindersPanel() {
  const reminders = usePlannerStore((s) => s.reminders)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const [open, setOpen] = useState(false)
  // One stable `now` per open. Reopening the panel re-buckets against a fresh clock.
  const [now, setNow] = useState(() => new Date())

  const groups = useMemo(() => groupReminders(reminders, now), [reminders, now])
  // "Upcoming" count — same meaning as before the regroup (pending + sending only).
  const upcomingCount = reminders.filter(
    (r) => r.status === 'pending' || r.status === 'sending',
  ).length

  return (
    <section className="space-y-3 border-t pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            if (!v) setNow(new Date())
            return !v
          })
        }}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold"
      >
        <BellRing className="size-4" aria-hidden />
        Pengingat
        <Badge variant="secondary">{upcomingCount}</Badge>
        <ChevronDown
          className={cn(
            'ml-auto size-4 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada pengingat. Tambahkan dari tugas mana pun, atau kirim{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">/ingatkan</code> ke bot.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {group.reminders.length}
                  </span>
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {group.reminders.map((r) => (
                    <li key={r.id}>
                      <ReminderRow reminder={r} tz={tz} now={now} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
