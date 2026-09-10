'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bold, CheckSquare, Code, Italic, Link, List } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/utils'
import { renderMarkdownLite } from '@/shared/lib/markdown-lite'
import { DEFAULT_TZ } from '@/shared/lib/format'
import { listForStatus } from '@/shared/lib/task-status-sync'
import { repositories } from '@/shared/repositories'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { moveTask } from '@/shared/use-cases/board/MoveTask.usecase'
import { Attachments } from './Attachments'
import { Checklist } from './Checklist'
import { insertLink, toggleLinePrefix, wrapInline, type EditResult } from './description-toolbar'
import { MetadataRail } from './MetadataRail'
import { ProgressNotes } from './ProgressNotes'

/**
 * Task detail. `Dialog` at ≥ lg (two columns: content left, 300px metadata rail
 * right); `Drawer` from the bottom below lg. Self-managed: reads `detailTaskId`
 * + the task from the store, renders nothing when either is missing.
 */
export function TaskDetailPanel() {
  const detailTaskId = usePlannerStore((s) => s.detailTaskId)
  const closeTask = usePlannerStore((s) => s.closeTask)
  const task = usePlannerStore((s) => s.tasks.find((t) => t.id === s.detailTaskId))
  const lists = usePlannerStore((s) => s.lists)
  const labels = usePlannerStore((s) => s.labels)
  const setStatus = usePlannerStore((s) => s.setStatus)
  const uid = useAuthStore((s) => s.user?.uid)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const isDesktop = useIsDesktop()

  const open = detailTaskId != null && task != null
  const onOpenChange = (o: boolean) => {
    if (!o) closeTask()
  }

  if (!open || !task) return null

  const body = (
    <PanelBody
      task={task}
      lists={lists}
      labels={labels}
      tz={tz}
      isDesktop={isDesktop}
      onMarkTaskDone={() => {
        // Keep listId in sync: if a "done" column exists, route through moveTask
        // (writes listId + status) so the card doesn't strand in its old column.
        const doneListId = listForStatus('done', lists)
        if (doneListId && uid) {
          const cards = usePlannerStore
            .getState()
            .tasks.filter((t) => t.listId === doneListId && t.id !== task.id)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          const last = cards[cards.length - 1]?.order ?? null
          void moveTask(uid, task.id, doneListId, (last ?? 0) + 1000, lists).catch(() =>
            toast.error('Gagal menandai selesai.'),
          )
          return
        }
        void setStatus(task.id, 'done').catch(() => toast.error('Gagal menandai selesai.'))
      }}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-testid="task-detail-dialog"
          className="max-w-3xl lg:max-w-4xl"
        >
          <DialogHeader className="text-left">
            <DialogTitle className="font-display leading-snug">{task.title}</DialogTitle>
            <DialogDescription className="sr-only">Detail tugas</DialogDescription>
          </DialogHeader>
          <DialogBody className="overflow-x-hidden">{body}</DialogBody>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="task-detail-drawer">
        <DrawerHeader>
          <DrawerTitle className="font-display">{task.title}</DrawerTitle>
          <DrawerDescription className="sr-only">Detail tugas</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="pb-8">{body}</DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

function PanelBody({
  task,
  lists,
  labels,
  tz,
  isDesktop,
  onMarkTaskDone,
}: {
  task: Task
  lists: Parameters<typeof MetadataRail>[0]['lists']
  labels: Parameters<typeof MetadataRail>[0]['labels']
  tz: string
  isDesktop: boolean
  onMarkTaskDone: () => void
}) {
  const rail = <MetadataRail task={task} lists={lists} labels={labels} tz={tz} />
  const main = (
    <div className="space-y-6">
      <Description task={task} />
      <Checklist task={task} onMarkTaskDone={onMarkTaskDone} />
      <Attachments task={task} />
      <ProgressNotes task={task} tz={tz} />
    </div>
  )

  if (isDesktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0">{main}</div>
        <aside className="min-w-0 border-l border-border/60 pl-5">{rail}</aside>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <RailSection>{rail}</RailSection>
      {main}
    </div>
  )
}

function RailSection({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-2">{children}</div>
}

/**
 * Textarea + a selection-wrapping markdown toolbar (limited subset — see
 * `markdown-lite`) and a Tulis/Pratinjau toggle. Persistence is the unchanged
 * 600ms debounce + onBlur flush to `notes`.
 */
function Description({ task }: { task: Task }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [value, setValue] = useState(task.notes ?? '')
  const [preview, setPreview] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  // Selection to re-apply after the controlled textarea re-renders.
  const pendingSel = useRef<{ start: number; end: number } | null>(null)

  // Re-sync when a different task opens in the same mounted panel.
  useEffect(() => {
    setValue(task.notes ?? '')
  }, [task.id, task.notes])

  useEffect(() => {
    const sel = pendingSel.current
    if (!sel || !areaRef.current) return
    pendingSel.current = null
    const el = areaRef.current
    el.focus()
    el.setSelectionRange(sel.start, sel.end)
  }, [value])

  const persist = (next: string) => {
    if (!uid) return
    const clean = next.trim() === '' ? null : next
    if (clean === (task.notes ?? null)) return
    // `maxLength` blocks typing past the cap, not a paste or a programmatic set.
    if (clean != null && clean.length > 20000) {
      toast.error('Deskripsi maksimal 20.000 karakter.')
      return
    }
    repositories.tasks.update(uid, task.id, { notes: clean }).catch(() => {
      toast.error('Gagal menyimpan deskripsi.')
    })
  }

  const schedulePersist = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(next), 600)
  }

  const applyEdit = (fn: (v: string, s: number, e: number) => EditResult) => {
    const el = areaRef.current
    if (!el) return
    const r = fn(value, el.selectionStart, el.selectionEnd)
    pendingSel.current = { start: r.selectionStart, end: r.selectionEnd }
    setValue(r.value)
    schedulePersist(r.value)
  }

  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm font-semibold">Deskripsi</h3>

      <div className="flex items-center gap-1">
        <ToolbarButton label="Tebal" onClick={() => applyEdit((v, s, e) => wrapInline(v, s, e, '**'))} disabled={preview}>
          <Bold aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Miring" onClick={() => applyEdit((v, s, e) => wrapInline(v, s, e, '*'))} disabled={preview}>
          <Italic aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Kode" onClick={() => applyEdit((v, s, e) => wrapInline(v, s, e, '`'))} disabled={preview}>
          <Code aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Tautan" onClick={() => applyEdit(insertLink)} disabled={preview}>
          <Link aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Daftar" onClick={() => applyEdit((v, s, e) => toggleLinePrefix(v, s, e, '- '))} disabled={preview}>
          <List aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Kotak centang"
          onClick={() => applyEdit((v, s, e) => toggleLinePrefix(v, s, e, '- [ ] '))}
          disabled={preview}
        >
          <CheckSquare aria-hidden />
        </ToolbarButton>

        <div className="ml-auto flex overflow-hidden rounded-md border border-input">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
            className={cn(
              'px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              !preview ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            Tulis
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
            className={cn(
              'px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              preview ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            Pratinjau
          </button>
        </div>
      </div>

      {preview ? (
        <div className="space-y-2 text-sm" data-testid="description-preview">
          {value.trim() === '' ? (
            <p className="text-muted-foreground">Tidak ada deskripsi.</p>
          ) : (
            renderMarkdownLite(value)
          )}
        </div>
      ) : (
        <Textarea
          ref={areaRef}
          value={value}
          rows={6}
          maxLength={20000}
          placeholder="Tambahkan deskripsi…"
          aria-label="Deskripsi tugas"
          onChange={(e) => {
            const next = e.target.value
            setValue(next)
            schedulePersist(next)
          }}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current)
            persist(value)
          }}
        />
      )}
    </section>
  )
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
