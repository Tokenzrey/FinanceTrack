'use client'

import { useState, type ReactNode } from 'react'
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
import type { BoardList, Label } from '@/shared/types/board'
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

/** Shared styling for a click-to-edit display button in a rail Row. */
const DISPLAY_BUTTON_CLASS =
  'rounded-md px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const SOURCE_LABELS: Record<Task['source'], string> = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

/**
 * One label→value row. A fixed label column with a left-aligned value beats
 * `justify-between` + `text-right`: long values ("+ Tambah tanggal mulai", a
 * created-at stamp) used to rag against the panel edge and wrap mid-phrase.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-200 hover:bg-muted/40 motion-reduce:transition-none">
      <span className="pt-px text-muted-foreground">{label}</span>
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
      className="rounded-md px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  if (!editing) {
    return ts ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {formatDateTime(ts.toDate(), tz)}
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
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="date"
        value={date}
        onChange={(e) => commit(e.target.value, time)}
        className="h-8 w-auto"
        aria-label={`${label} tanggal`}
      />
      <Input
        type="time"
        value={time}
        onChange={(e) => commit(date, e.target.value)}
        className="h-8 w-auto"
        aria-label={`${label} waktu`}
      />
      {date && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground"
          onClick={() => commit('', '')}
        >
          Hapus
        </Button>
      )}
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
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 w-auto"
        aria-label="Tanggal pengingat"
      />
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="h-8 w-auto"
        aria-label="Waktu pengingat"
      />
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="h-8 w-[180px] max-w-full"
        aria-label="Isi pengingat"
      />
      <Button size="sm" className="h-8 px-2" disabled={busy} onClick={() => void submit()}>
        Tambah
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-muted-foreground"
        onClick={onDone}
      >
        Batal
      </Button>
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
      <div className="flex flex-wrap items-center gap-1.5">
        {eligible.length === 0 ? (
          <span className="text-xs text-muted-foreground">Tidak ada tugas lain.</span>
        ) : (
          <Select onValueChange={onAdd}>
            <SelectTrigger className="h-8 w-[200px] max-w-full" aria-label="Pilih tugas blocker">
              <SelectValue placeholder="Pilih tugas…" />
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
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground"
          onClick={() => setEditing(false)}
        >
          Selesai
        </Button>
      </div>
    )
  }

  if (blockerIds.length === 0) {
    return <AddAction label="Tambah dependency" onClick={() => setEditing(true)} />
  }

  return (
    <div className="flex flex-wrap gap-1">
      {blockerIds.map((id) => {
        const title = titleById.get(id)
        return (
          <span
            key={id}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
          >
            <span className="max-w-[140px] truncate">
              {title ?? id}
              {title == null && <span className="text-muted-foreground"> (tidak ditemukan)</span>}
            </span>
            <button
              type="button"
              aria-label={`Hapus dependency ${title ?? id}`}
              onClick={() => onRemove(id)}
              className="shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </span>
        )
      })}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        + Tambah
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
  const [editList, setEditList] = useState(false)
  const [editStatus, setEditStatus] = useState(false)
  const [editPriority, setEditPriority] = useState(false)
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
    <div className="space-y-0.5">
      {/* Status / Kolom — moving the column keeps `status` in sync via moveTask. */}
      <Row label="Kolom">
        {editList ? (
          <Select
            value={currentListId ?? ''}
            onValueChange={(v) => {
              setEditList(false)
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
            onOpenChange={(o) => {
              if (!o) setEditList(false)
            }}
          >
            <SelectTrigger className="h-8 w-[160px]" aria-label="Kolom tugas">
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
        ) : currentListId == null ? (
          <AddAction label="Pilih kolom" onClick={() => setEditList(true)} />
        ) : (
          <button type="button" onClick={() => setEditList(true)} className={DISPLAY_BUTTON_CLASS}>
            {sortedLists.find((l) => l.id === currentListId)?.title ?? 'Pilih kolom'}
          </button>
        )}
      </Row>

      {/* Status axis (bot-visible), editable independently — only for a list-less task.
          For a column-bound task the Kolom row owns the status axis and keeps it synced. */}
      {task.listId == null && (
        <Row label="Status">
          {editStatus ? (
            <Select
              value={task.status}
              onValueChange={(v) => {
                setEditStatus(false)
                void setStatus(task.id, v as TaskStatus)
              }}
              onOpenChange={(o) => {
                if (!o) setEditStatus(false)
              }}
            >
              <SelectTrigger className="h-8 w-[160px]" aria-label="Status tugas">
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
          ) : (
            <button type="button" onClick={() => setEditStatus(true)} className={DISPLAY_BUTTON_CLASS}>
              {STATUS_LABELS[task.status]}
            </button>
          )}
        </Row>
      )}

      <Row label="Tanggal mulai">
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

      <Row label="Jatuh tempo">
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

      <Row label="Prioritas">
        {editPriority ? (
          <Select
            value={task.priority}
            onValueChange={(v) => {
              setEditPriority(false)
              void patch({ priority: v as TaskPriority })
            }}
            onOpenChange={(o) => {
              if (!o) setEditPriority(false)
            }}
          >
            <SelectTrigger className="h-8 w-[140px]" aria-label="Prioritas tugas">
              <span className="flex items-center gap-1.5">
                <PriorityDot priority={task.priority} />
                {PRIORITY_LABELS[task.priority]}
              </span>
            </SelectTrigger>
            <SelectContent>
              {(['low', 'med', 'high'] as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            type="button"
            onClick={() => setEditPriority(true)}
            className={cn(DISPLAY_BUTTON_CLASS, 'inline-flex items-center gap-1.5')}
          >
            <PriorityDot priority={task.priority} />
            {PRIORITY_LABELS[task.priority]}
          </button>
        )}
      </Row>

      <Row label="Label">
        {editLabels || taskLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((l) => {
              const on = (task.labelIds ?? []).includes(l.id)
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
                    'rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-foreground/30 bg-muted' : 'border-border text-muted-foreground',
                  )}
                >
                  {l.name}
                </button>
              )
            })}
            {labels.length === 0 && (
              <span className="text-xs text-muted-foreground">Belum ada label di papan.</span>
            )}
            <button
              type="button"
              onClick={() => setLabelMgrOpen(true)}
              className="rounded-md px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Kelola label
            </button>
          </div>
        ) : (
          <AddAction label="Tambah label" onClick={() => setEditLabels(true)} />
        )}
      </Row>

      <Row label="Story points">
        {editPoints || task.storyPoints != null ? (
          <Input
            type="number"
            min={0}
            autoFocus={editPoints}
            defaultValue={task.storyPoints ?? ''}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              const next = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
              if (next !== task.storyPoints) void patch({ storyPoints: Number.isFinite(next as number) ? next : null })
              setEditPoints(false)
            }}
            className="h-8 w-20"
            aria-label="Story points"
          />
        ) : (
          <AddAction label="Tambah story points" onClick={() => setEditPoints(true)} />
        )}
      </Row>

      <Row label="Dependencies">
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

      <Row label="Pengingat">
        {editReminder ? (
          <ReminderAdder task={task} tz={tz} onDone={() => setEditReminder(false)} />
        ) : reminderCount > 0 ? (
          <button
            type="button"
            onClick={() => setEditReminder(true)}
            className={cn(DISPLAY_BUTTON_CLASS, 'font-mono text-xs tabular-nums')}
          >
            {reminderCount} aktif
          </button>
        ) : (
          <AddAction label="Tambah pengingat" onClick={() => setEditReminder(true)} />
        )}
      </Row>

      <Row label="Asal">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <SourceGlyph source={task.source} />
          {SOURCE_LABELS[task.source]}
          <span className="font-mono text-xs tabular-nums">
            · {formatDateTime(task.createdAt.toDate(), tz)}
          </span>
        </span>
      </Row>

      <LabelManagerDialog open={labelMgrOpen} onOpenChange={setLabelMgrOpen} />
    </div>
  )
}
