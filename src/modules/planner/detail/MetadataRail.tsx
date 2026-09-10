'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  Calendar,
  Check,
  Clock,
  Flag,
  GitFork,
  Hash,
  Kanban,
  Laptop,
  Plus,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'
import { formatDateTime } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { LABEL_COLORS, type BoardList, type Label } from '@/shared/types/board'
import type { Task, TaskPriority, TaskStatus } from '@/shared/types/productivity'
import { addDependency } from '@/shared/use-cases/board/AddDependency.usecase'
import { moveTask } from '@/shared/use-cases/board/MoveTask.usecase'
import { removeDependency } from '@/shared/use-cases/board/RemoveDependency.usecase'
import { setTaskLabels } from '@/shared/use-cases/board/SetTaskLabels.usecase'
import { setTaskSchedule } from '@/shared/use-cases/board/SetTaskSchedule.usecase'
import { useTaskLeads } from '../list/ListView'
import { PriorityDot } from '../shared/PriorityDot'
import { SourceGlyph } from '../shared/SourceGlyph'
import { LabelManagerDialog } from './LabelManagerDialog'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Rendah',
  med: 'Sedang',
  high: 'Tinggi',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Belum',
  doing: 'Proses',
  done: 'Selesai',
}

const SOURCE_LABELS: Record<Task['source'], string> = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

/**
 * One label→value row. A fixed label column with an icon on the left, and interactive value on the right.
 */
function Row({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  children: ReactNode
  className?: string
}) {
  // Always stacked: label on top, value full-width below. The rail lives in a ~320px
  // column, too narrow for a side-by-side label + a date/select editor without
  // overflowing — so every editor gets the whole width to work in.
  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** A calm ghost "+ Tambah …" action for an empty row — never a gaping input. */
function AddAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
    >
      + {label}
    </button>
  )
}

/** `Timestamp | null` → `{ date, time }` wall-clock strings in `tz` for the split native inputs. */
function toDateTimeParts(ts: { toDate(): Date } | null | undefined, tz: string): { date: string; time: string } {
  if (!ts) return { date: '', time: '' }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(ts.toDate())
      .map((x) => [x.type, x.value]),
  )
  const hour = p.hour === '24' ? '00' : p.hour
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` }
}

/** `{ date, time }` wall-clock in `tz` → the matching UTC `Date`, or `null` if no date. */
function partsToUtc(date: string, time: string, tz: string): Date | null {
  if (!date) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = (time || '00:00').split(':').map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0))
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(guess)
      .map((x) => [x.type, x.value]),
  )
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour === 24 ? 0 : +parts.hour,
    +parts.minute,
    +parts.second,
  )
  return new Date(guess.getTime() - (asUTC - guess.getTime()))
}

/** One `date` + `time` pair that commits a schedule field on change. */
function ScheduleField({
  label,
  ts,
  tz,
  onCommit,
}: {
  label: string
  ts: { toDate(): Date } | null | undefined
  tz: string
  onCommit: (next: Date | null) => void
}) {
  const initial = toDateTimeParts(ts, tz)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)

  useEffect(() => {
    const next = toDateTimeParts(ts, tz)
    setDate(next.date)
    setTime(next.time)
  }, [ts, tz])

  if (!editing) {
    return ts ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium transition-colors hover:border-border hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
      >
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate">{formatDateTime(ts.toDate(), tz)}</span>
      </button>
    ) : (
      <AddAction label={label} onClick={() => setEditing(true)} />
    )
  }

  const commit = (d: string, t: string) => {
    setDate(d)
    setTime(t)
    onCommit(partsToUtc(d, t, tz))
  }

  return (
    <div className="w-full space-y-2.5 rounded-lg border border-border/80 bg-background/95 p-3 shadow-xs">
      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tanggal
        </label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-full min-w-0 text-sm"
          aria-label={`${label} tanggal`}
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Waktu
        </label>
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-9 w-full min-w-0 text-sm"
          aria-label={`${label} waktu`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 text-xs font-medium"
          onClick={() => {
            commit(date, time)
            setEditing(false)
          }}
        >
          Simpan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const prev = toDateTimeParts(ts, tz)
            setDate(prev.date)
            setTime(prev.time)
            setEditing(false)
          }}
        >
          Batal
        </Button>
        {date && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              commit('', '')
              setEditing(false)
            }}
          >
            Hapus
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Pengingat row editor: date + time + message, creating ONE reminder pinned to this
 * task. Not a reminder manager (that's `RemindersPanel`) — just "add one here".
 * `createReminder`'s validation (1–500 chars, must be future) surfaces as a toast.
 */
function ReminderAdder({
  task,
  tz,
  onDone,
}: {
  task: Task
  tz: string
  onDone: () => void
}) {
  const create = usePlannerStore((s) => s.createStandaloneReminder)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [message, setMessage] = useState(task.title)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const remindAt = partsToUtc(date, time, tz)
    if (!remindAt) {
      toast.error('Pilih tanggal pengingat.')
      return
    }
    setBusy(true)
    try {
      await create({ message, remindAt, source: 'web', taskId: task.id })
      toast.success('Pengingat ditambahkan.')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambah pengingat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full space-y-2.5 rounded-lg border border-border/80 bg-background/95 p-3 shadow-xs">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="min-w-0 space-y-1.5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tanggal
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full min-w-0 text-sm"
            aria-label="Tanggal pengingat"
          />
        </div>
        <div className="w-24 space-y-1.5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Waktu
          </label>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-full min-w-0 text-sm"
            aria-label="Waktu pengingat"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pesan
        </label>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="h-9 w-full text-sm"
          aria-label="Isi pengingat"
          placeholder="Pesan pengingat"
        />
      </div>
      <div className="flex items-center gap-2 border-t border-border/50 pt-2.5">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 text-xs font-medium"
          disabled={busy}
          onClick={() => void submit()}
        >
          Tambah
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDone}
        >
          Batal
        </Button>
      </div>
    </div>
  )
}

/**
 * Dependencies row: removable title chips for the current blockers plus a task
 * picker in edit mode. Picking routes through `addDependency` (cycle/cap/self
 * rejection surfaces as a toast). A blocker id with no matching task shows the
 * raw id and a muted "(tidak ditemukan)".
 */
function DependencyPicker({
  task,
  allTasks,
  editing,
  setEditing,
  onAdd,
  onRemove,
}: {
  task: Task
  allTasks: Task[]
  editing: boolean
  setEditing: (v: boolean) => void
  onAdd: (pickedId: string) => void
  onRemove: (blockerId: string) => void
}) {
  const blockerIds = task.dependsOn ?? []
  const titleById = new Map(allTasks.map((t) => [t.id, t.title]))
  const eligible = allTasks.filter((t) => t.id !== task.id && !blockerIds.includes(t.id))

  if (editing) {
    return (
      <div className="w-full space-y-2 rounded-lg border border-border/80 bg-background/95 p-2.5 shadow-xs">
        {eligible.length === 0 ? (
          <span className="text-xs text-muted-foreground block">Tidak ada tugas lain yang tersedia.</span>
        ) : (
          <Select onValueChange={onAdd}>
            <SelectTrigger className="h-8 w-full text-xs" aria-label="Pilih tugas blocker">
              <SelectValue placeholder="Pilih tugas blocker…" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="block max-w-[220px] truncate">{t.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex justify-end border-t border-border/50 pt-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => setEditing(false)}
          >
            Selesai
          </Button>
        </div>
      </div>
    )
  }

  if (blockerIds.length === 0) {
    return <AddAction label="Tambah dependency" onClick={() => setEditing(true)} />
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {blockerIds.map((id) => {
        const title = titleById.get(id)
        return (
          <span
            key={id}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-xs"
          >
            <span className="max-w-[130px] truncate font-medium">
              {title ?? id}
              {title == null && <span className="text-muted-foreground"> (tidak ditemukan)</span>}
            </span>
            <button
              type="button"
              aria-label={`Hapus dependency ${title ?? id}`}
              onClick={() => onRemove(id)}
              className="shrink-0 rounded-full text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </span>
        )
      })}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
        aria-label="Tambah dependency"
        title="Tambah dependency"
      >
        <Plus className="size-3" aria-hidden />
      </button>
    </div>
  )
}

interface MetadataRailProps {
  task: Task
  lists: BoardList[]
  labels: Label[]
  tz: string
}

/**
 * Label→value rows, click-to-edit-in-place. Not a form — an empty row shows a
 * calm "+ Tambah …" ghost, never an outlined empty field.
 */
export function MetadataRail({ task, lists, labels, tz }: MetadataRailProps) {
  const uid = useAuthStore((s) => s.user?.uid)
  const leads = useTaskLeads()
  const setStatus = usePlannerStore((s) => s.setStatus)
  const allTasks = usePlannerStore((s) => s.tasks)
  const [editLabels, setEditLabels] = useState(false)
  const [labelMgrOpen, setLabelMgrOpen] = useState(false)
  const [editPoints, setEditPoints] = useState(false)
  const [editDeps, setEditDeps] = useState(false)
  const [editReminder, setEditReminder] = useState(false)

  const sortedLists = [...lists].sort((a, b) => a.order - b.order)
  const currentListId = task.listId ?? null
  const taskLabels = (task.labelIds ?? [])
    .map((id) => labels.find((l) => l.id === id))
    .filter((l): l is Label => !!l)
  const reminderCount = usePlannerStore((s) =>
    s.reminders.filter((r) => r.taskId === task.id && r.status === 'pending').length,
  )

  const patch = async (data: Parameters<typeof repositories.tasks.update>[2]) => {
    if (!uid) return
    try {
      await repositories.tasks.update(uid, task.id, data)
    } catch {
      toast.error('Gagal menyimpan perubahan.')
    }
  }

  return (
    <div className="space-y-1">
      <div className="pb-1.5 mb-1 border-b border-border/50">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Detail Properti
        </h4>
      </div>

      {/* Kolom */}
      <Row icon={Kanban} label="Kolom">
        <Select
          value={currentListId ?? ''}
          onValueChange={(v) => {
            if (!uid) return
            const cards = usePlannerStore
              .getState()
              .tasks.filter((t) => t.listId === v && t.id !== task.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            const last = cards[cards.length - 1]?.order ?? null
            void moveTask(uid, task.id, v, (last ?? 0) + 1000, lists).catch(() =>
              toast.error('Gagal memindahkan tugas.'),
            )
          }}
        >
          <SelectTrigger
            className="h-8 w-fit max-w-full justify-between gap-2 border-border/60 bg-background/60 hover:bg-accent/60 text-xs sm:text-sm font-medium"
            aria-label="Kolom tugas"
          >
            <SelectValue placeholder="Pilih kolom" />
          </SelectTrigger>
          <SelectContent>
            {sortedLists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      {/* Status axis (bot-visible), editable independently — only for a list-less task. */}
      {task.listId == null && (
        <Row icon={Check} label="Status">
          <Select
            value={task.status}
            onValueChange={(v) => {
              void setStatus(task.id, v as TaskStatus)
            }}
          >
            <SelectTrigger
              className="h-8 w-fit max-w-full justify-between gap-2 border-border/60 bg-background/60 hover:bg-accent/60 text-xs sm:text-sm font-medium"
              aria-label="Status tugas"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      )}

      {/* Tanggal mulai */}
      <Row icon={Calendar} label="Tanggal mulai" className={task.startAt ? undefined : 'items-center'}>
        <ScheduleField
          label="Tambah tanggal mulai"
          ts={task.startAt}
          tz={tz}
          onCommit={(next) => {
            if (!uid) return
            void setTaskSchedule(uid, task, { startAt: next }, leads).catch(() =>
              toast.error('Gagal menyimpan tanggal.'),
            )
          }}
        />
      </Row>

      {/* Jatuh tempo */}
      <Row icon={Clock} label="Jatuh tempo" className={task.dueAt ? undefined : 'items-center'}>
        <ScheduleField
          label="Tambah jatuh tempo"
          ts={task.dueAt}
          tz={tz}
          onCommit={(next) => {
            if (!uid) return
            void setTaskSchedule(uid, task, { dueAt: next }, leads).catch(() =>
              toast.error('Gagal menyimpan tanggal.'),
            )
          }}
        />
      </Row>

      {/* Prioritas */}
      <Row icon={Flag} label="Prioritas">
        <Select
          value={task.priority}
          onValueChange={(v) => {
            void patch({ priority: v as TaskPriority })
          }}
        >
          <SelectTrigger
            className="h-8 w-fit max-w-full justify-between gap-2 border-border/60 bg-background/60 hover:bg-accent/60 text-xs sm:text-sm font-medium"
            aria-label="Prioritas tugas"
          >
            <span className="flex items-center gap-1.5">
              <PriorityDot priority={task.priority} />
              <span>{PRIORITY_LABELS[task.priority]}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {(['low', 'med', 'high'] as TaskPriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                <span className="flex items-center gap-1.5">
                  <PriorityDot priority={p} />
                  <span>{PRIORITY_LABELS[p]}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      {/* Label */}
      <Row icon={Tag} label="Label" className={editLabels ? 'items-start' : undefined}>
        {editLabels ? (
          <div className="w-full space-y-2 rounded-lg border border-border/80 bg-background/95 p-2.5 shadow-xs">
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => {
                const on = (task.labelIds ?? []).includes(l.id)
                const colorClass = LABEL_COLORS[l.colorKey]
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? (task.labelIds ?? []).filter((id) => id !== l.id)
                        : [...(task.labelIds ?? []), l.id]
                      if (uid) void setTaskLabels(uid, task, next)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on
                        ? cn(colorClass.light, 'border-transparent shadow-xs dark:hidden')
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                    )}
                  >
                    {on && <Check className="size-3" />}
                    <span>{l.name}</span>
                  </button>
                )
              })}
              {labels.map((l) => {
                const on = (task.labelIds ?? []).includes(l.id)
                if (!on) return null
                const colorClass = LABEL_COLORS[l.colorKey]
                return (
                  <button
                    key={`${l.id}-dark`}
                    type="button"
                    onClick={() => {
                      const next = (task.labelIds ?? []).filter((id) => id !== l.id)
                      if (uid) void setTaskLabels(uid, task, next)
                    }}
                    className={cn(
                      'hidden items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-all dark:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      colorClass.dark,
                    )}
                  >
                    <Check className="size-3" />
                    <span>{l.name}</span>
                  </button>
                )
              })}
              {labels.length === 0 && (
                <span className="text-xs text-muted-foreground">Belum ada label di papan.</span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border/50 pt-1.5">
              <button
                type="button"
                onClick={() => setLabelMgrOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Kelola label
              </button>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setEditLabels(false)}
              >
                Selesai
              </Button>
            </div>
          </div>
        ) : taskLabels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {taskLabels.map((l) => {
              const colorClass = LABEL_COLORS[l.colorKey]
              return (
                <span
                  key={l.id}
                  className={cn(
                    'inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium',
                    colorClass.light,
                    'dark:hidden',
                  )}
                >
                  {l.name}
                </span>
              )
            })}
            {taskLabels.map((l) => {
              const colorClass = LABEL_COLORS[l.colorKey]
              return (
                <span
                  key={`${l.id}-dark`}
                  className={cn(
                    'hidden items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium dark:inline-flex',
                    colorClass.dark,
                  )}
                >
                  {l.name}
                </span>
              )
            })}
            <button
              type="button"
              onClick={() => setEditLabels(true)}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Ubah label"
              title="Ubah label"
            >
              <Plus className="size-3" />
            </button>
          </div>
        ) : (
          <AddAction label="Tambah label" onClick={() => setEditLabels(true)} />
        )}
      </Row>

      {/* Story points */}
      <Row icon={Hash} label="Story points">
        {editPoints ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              autoFocus
              defaultValue={task.storyPoints ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const raw = (e.target as HTMLInputElement).value.trim()
                  const next = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
                  if (next !== task.storyPoints) void patch({ storyPoints: Number.isFinite(next as number) ? next : null })
                  setEditPoints(false)
                }
                if (e.key === 'Escape') setEditPoints(false)
              }}
              onBlur={(e) => {
                const raw = e.target.value.trim()
                const next = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
                if (next !== task.storyPoints) void patch({ storyPoints: Number.isFinite(next as number) ? next : null })
                setEditPoints(false)
              }}
              className="h-8 w-20 text-xs sm:text-sm font-mono"
              aria-label="Story points"
            />
            <span className="text-xs text-muted-foreground font-mono">pts</span>
          </div>
        ) : task.storyPoints != null ? (
          <button
            type="button"
            onClick={() => setEditPoints(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-xs sm:text-sm font-mono font-medium hover:bg-accent/60 transition-colors"
          >
            <span>{task.storyPoints}</span>
            <span className="text-muted-foreground text-xs">pts</span>
          </button>
        ) : (
          <AddAction label="Tambah story points" onClick={() => setEditPoints(true)} />
        )}
      </Row>

      {/* Dependencies */}
      <Row icon={GitFork} label="Dependencies" className={editDeps ? 'items-start' : undefined}>
        <DependencyPicker
          task={task}
          allTasks={allTasks}
          editing={editDeps}
          setEditing={setEditDeps}
          onAdd={(pickedId) => {
            if (!uid) return
            void addDependency(uid, task, pickedId, allTasks)
              .catch((e) => toast.error(e instanceof Error ? e.message : 'Gagal menambah dependency.'))
              .finally(() => setEditDeps(false))
          }}
          onRemove={(blockerId) => {
            if (!uid) return
            void removeDependency(uid, task, blockerId).catch(() =>
              toast.error('Gagal menghapus dependency.'),
            )
          }}
        />
      </Row>

      {/* Pengingat */}
      <Row icon={Bell} label="Pengingat" className={editReminder ? 'items-start' : undefined}>
        {editReminder ? (
          <ReminderAdder task={task} tz={tz} onDone={() => setEditReminder(false)} />
        ) : reminderCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditReminder(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-xs font-mono font-medium tabular-nums hover:bg-accent/60 transition-colors"
            >
              <Bell className="size-3 text-muted-foreground" />
              <span>{reminderCount} aktif</span>
            </button>
            <button
              type="button"
              onClick={() => setEditReminder(true)}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Tambah pengingat"
              title="Tambah pengingat"
            >
              <Plus className="size-3" />
            </button>
          </div>
        ) : (
          <AddAction label="Tambah pengingat" onClick={() => setEditReminder(true)} />
        )}
      </Row>

      {/* Asal */}
      <Row icon={Laptop} label="Asal">
        <div className="flex flex-col gap-0.5 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium">
            <SourceGlyph source={task.source} />
            {SOURCE_LABELS[task.source]}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatDateTime(task.createdAt.toDate(), tz)}
          </span>
        </div>
      </Row>

      <LabelManagerDialog open={labelMgrOpen} onOpenChange={setLabelMgrOpen} />
    </div>
  )
}
