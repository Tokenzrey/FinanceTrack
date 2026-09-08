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
import { moveTask } from '@/shared/use-cases/board/MoveTask.usecase'
import { setTaskSchedule } from '@/shared/use-cases/board/SetTaskSchedule.usecase'
import { PriorityDot } from '../shared/PriorityDot'
import { SourceGlyph } from '../shared/SourceGlyph'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Rendah',
  med: 'Sedang',
  high: 'Tinggi',
}

const SOURCE_LABELS: Record<Task['source'], string> = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

/** One label→value row. Value is right-aligned on desktop, under the label below `sm`. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md px-1.5 py-1.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 sm:text-right">{children}</div>
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
    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
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
  const setStatus = usePlannerStore((s) => s.setStatus)
  const [editLabels, setEditLabels] = useState(false)
  const [editPoints, setEditPoints] = useState(false)
  const [editDeps, setEditDeps] = useState(false)

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
      </Row>

      {/* Status axis (bot-visible), editable independently for a list-less task. */}
      <Row label="Status">
        <Select value={task.status} onValueChange={(v) => void setStatus(task.id, v as TaskStatus)}>
          <SelectTrigger className="h-8 w-[160px]" aria-label="Status tugas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'todo' ? 'Belum' : s === 'doing' ? 'Proses' : 'Selesai'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row label="Tanggal mulai">
        <ScheduleField
          label="Tambah tanggal mulai"
          ts={task.startAt}
          tz={tz}
          onCommit={(next) => {
            if (!uid) return
            void setTaskSchedule(uid, task.id, { startAt: next }).catch(() =>
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
            void setTaskSchedule(uid, task.id, { dueAt: next }).catch(() =>
              toast.error('Gagal menyimpan tanggal.'),
            )
          }}
        />
      </Row>

      <Row label="Prioritas">
        <Select value={task.priority} onValueChange={(v) => void patch({ priority: v as TaskPriority })}>
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
      </Row>

      <Row label="Label">
        {editLabels || taskLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1 sm:justify-end">
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
                    void patch({ labelIds: next })
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
            className="h-8 w-20 sm:ml-auto"
            aria-label="Story points"
          />
        ) : (
          <AddAction label="Tambah story points" onClick={() => setEditPoints(true)} />
        )}
      </Row>

      <Row label="Dependencies">
        {editDeps || (task.dependsOn ?? []).length > 0 ? (
          <Input
            autoFocus={editDeps}
            defaultValue={(task.dependsOn ?? []).join(', ')}
            placeholder="ID tugas, pisahkan koma"
            onBlur={(e) => {
              const next = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
              void patch({ dependsOn: next })
              setEditDeps(false)
            }}
            className="h-8 w-[200px] max-w-full sm:ml-auto"
            aria-label="Dependencies"
          />
        ) : (
          <AddAction label="Tambah dependency" onClick={() => setEditDeps(true)} />
        )}
      </Row>

      <Row label="Pengingat">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {reminderCount > 0 ? `${reminderCount} aktif` : 'Tidak ada'}
        </span>
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
    </div>
  )
}
