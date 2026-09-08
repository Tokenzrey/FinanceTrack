'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Loader2, ListChecks, MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { cn } from '@/shared/lib/utils'
import { getDb } from '@/shared/lib/firebase'
import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import { parseWhen, stripWhenTokens } from '@/shared/lib/parse-when'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import {
  DEFAULT_PLANNER_PREFS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/shared/types/productivity'

/** Reminder lead times for a task's due date, from the same `meta/plannerPrefs` doc the
 *  bot honours (Settings is the only writer, via `/api/planner/prefs`). Falls back to the
 *  built-in default for a user who never opened Settings. */
export function useTaskLeads(): number[] {
  const userId = useAuthStore((s) => s.user?.uid)
  const [leads, setLeads] = useState<number[]>(DEFAULT_PLANNER_PREFS.taskLeadsMinutes)

  useEffect(() => {
    if (!userId) return
    void getDoc(doc(getDb(), 'users', userId, 'meta', 'plannerPrefs')).then((snap) => {
      const stored = snap.exists() ? (snap.data() as { taskLeadsMinutes?: unknown }) : {}
      if (Array.isArray(stored.taskLeadsMinutes) && stored.taskLeadsMinutes.length > 0) {
        setLeads(stored.taskLeadsMinutes as number[])
      }
    })
  }, [userId])

  return leads
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Belum',
  doing: 'Proses',
  done: 'Selesai',
}
const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done']

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-red-500',
  med: 'bg-yellow-500',
  low: 'bg-muted-foreground/50',
}

const FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'todo', label: 'Belum' },
  { value: 'doing', label: 'Proses' },
  { value: 'done', label: 'Selesai' },
  { value: 'all', label: 'Semua' },
]

function parsePriority(text: string): TaskPriority | undefined {
  const match = text.match(/!(high|med|low)\b/i)
  return match ? (match[1].toLowerCase() as TaskPriority) : undefined
}

/** `Date` → `YYYY-MM-DDTHH:mm` as the wall-clock time in `tz` for `<input type="datetime-local">`.
 *  Uses `Intl.DateTimeFormat` so a WITA/WIT user sees their own local time, not the browser's.
 *  Exported for the round-trip test only. */
export function toDatetimeLocal(date: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  )
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}

/** `YYYY-MM-DDTHH:mm` read as wall-clock in `tz` → the matching UTC instant.
 *  Same shape as parse-when's `localWallToUtc`: guess UTC, measure the zone offset, subtract it.
 *  Exported for the round-trip test only. */
export function datetimeLocalToUtc(value: string, tz: string): Date {
  const [d, t] = value.split('T')
  const [y, mo, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, day, h, mi, 0))
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

export function QuickAddBar() {
  const addTask = usePlannerStore((s) => s.addTask)
  const setDue = usePlannerStore((s) => s.setDue)
  const leads = useTaskLeads()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const raw = text.trim()
    if (!raw || busy) return

    const tz = useAuthStore.getState().profile?.timezone ?? DEFAULT_TZ
    const parsed = parseWhen(raw, new Date(), tz)
    const priority = parsePriority(raw)
    const title = stripWhenTokens(raw)
      .replace(/!\S+/g, '')
      .trim()

    if (!title) {
      toast.error('Judul tugas wajib diisi')
      return
    }

    setBusy(true)
    try {
      const task = await addTask({ title, priority, source: 'web' })
      if (parsed) await setDue(task.id, title, parsed.at, leads)
      setText('')
      toast.success('Tugas ditambahkan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menambah tugas')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={'Tambah tugas… (mis. "Review PRD besok jam 3 sore !high")'}
        aria-label="Tambah tugas"
        disabled={busy}
      />
      <Button type="submit" disabled={busy || !text.trim()}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Tambah
      </Button>
    </form>
  )
}

function TaskDueDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setDue = usePlannerStore((s) => s.setDue)
  const leads = useTaskLeads()
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const [value, setValue] = useState(task.dueAt ? toDatetimeLocal(task.dueAt.toDate(), tz) : '')
  const [saving, setSaving] = useState(false)

  const run = async (action: () => Promise<void>, done: string) => {
    setSaving(true)
    try {
      await action()
      toast.success(done)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atur jatuh tempo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-due" className="text-xs">
              Tanggal &amp; waktu
            </Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={saving || !value}
              onClick={() =>
                void run(
                  () => setDue(task.id, task.title, datetimeLocalToUtc(value, tz), leads),
                  'Jatuh tempo diatur',
                )
              }
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
            {task.dueAt && (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  void run(() => setDue(task.id, task.title, null, []), 'Jatuh tempo dihapus')
                }
              >
                Hapus jatuh tempo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TaskRow({ task, tz }: { task: Task; tz: string }) {
  const setStatus = usePlannerStore((s) => s.setStatus)
  const removeTask = usePlannerStore((s) => s.removeTask)
  const [dueOpen, setDueOpen] = useState(false)

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <span
          className={cn('size-2.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-sm font-medium',
              task.status === 'done' && 'text-muted-foreground line-through',
            )}
          >
            {task.title}
          </p>
          {task.dueAt && (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(task.dueAt.toDate(), tz)}
            </p>
          )}
        </div>

        <Select
          value={task.status}
          onValueChange={(value) => void setStatus(task.id, value as TaskStatus)}
        >
          <SelectTrigger className="h-8 w-[104px]" aria-label={`Status ${task.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Aksi ${task.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDueOpen(true)}>Atur jatuh tempo</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void (async () => {
                  try {
                    await removeTask(task.id)
                    toast.success('Tugas dihapus')
                  } catch {
                    toast.error('Gagal menghapus tugas.')
                  }
                })()
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" aria-hidden />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>

      {dueOpen && <TaskDueDialog task={task} open={dueOpen} onOpenChange={setDueOpen} />}
    </Card>
  )
}

/** The original single-list task view — status filter chips + a list of `TaskRow`s.
 *  Lifted verbatim from `PlannerPage` when the board/timeline tabs landed (Task 8). */
export function ListView() {
  const tasks = usePlannerStore((s) => s.tasks)
  const isLoading = usePlannerStore((s) => s.isLoading)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const [filter, setFilter] = useState<TaskStatus | 'all'>('todo')

  const shown = filter === 'all' ? tasks : tasks.filter((task) => task.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => {
          const count =
            entry.value === 'all'
              ? tasks.length
              : tasks.filter((task) => task.status === entry.value).length
          return (
            <Button
              key={entry.value}
              variant={filter === entry.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(entry.value)}
            >
              {entry.label}
              <Badge variant="secondary" className="ml-2">
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>

      {isLoading && tasks.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Belum ada tugas"
          description="Belum ada tugas — tambahkan yang pertama di atas."
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((task) => (
            <li key={task.id}>
              <TaskRow task={task} tz={tz} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
