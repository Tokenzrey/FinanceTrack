'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { Textarea } from '@/shared/components/ui/textarea'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { DEFAULT_TZ } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { Attachments } from './Attachments'
import { Checklist } from './Checklist'
import { MetadataRail } from './MetadataRail'
import { ProgressNotes } from './ProgressNotes'

/**
 * Task detail. `Dialog` at ≥ lg (two columns: content left, 280px metadata rail
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
            <DialogTitle className="font-display">{task.title}</DialogTitle>
            <DialogDescription className="sr-only">Detail tugas</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="task-detail-drawer" className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display">{task.title}</DrawerTitle>
          <DrawerDescription className="sr-only">Detail tugas</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">{body}</div>
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
      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div className="min-w-0">{main}</div>
        <aside className="border-l border-border pl-4">{rail}</aside>
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

/** Plain textarea, debounced-persist to `notes`. Markdown toolbar is Task 11. */
function Description({ task }: { task: Task }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [value, setValue] = useState(task.notes ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-sync when a different task opens in the same mounted panel.
  useEffect(() => {
    setValue(task.notes ?? '')
  }, [task.id, task.notes])

  const persist = (next: string) => {
    if (!uid) return
    const clean = next.trim() === '' ? null : next
    if (clean === (task.notes ?? null)) return
    repositories.tasks.update(uid, task.id, { notes: clean }).catch(() => {
      toast.error('Gagal menyimpan deskripsi.')
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm font-semibold">Deskripsi</h3>
      {/* Task 11: markdown toolbar + preview toggle mounts here */}
      <Textarea
        value={value}
        rows={4}
        placeholder="Tambahkan deskripsi…"
        aria-label="Deskripsi tugas"
        onChange={(e) => {
          const next = e.target.value
          setValue(next)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => persist(next), 600)
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current)
          persist(value)
        }}
      />
    </section>
  )
}
