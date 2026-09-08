'use client'

import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { LABEL_COLORS, type Label, type LabelColorKey } from '@/shared/types/board'

const COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColorKey[]

/** Two-span light/dark fill, same trick as `LabelStrip` (no `dark:` variants in `LABEL_COLORS`). */
function Swatch({ colorKey, className }: { colorKey: LabelColorKey; className?: string }) {
  const { light, dark } = LABEL_COLORS[colorKey]
  return (
    <span className={cn('flex overflow-hidden rounded', className)} aria-hidden>
      <span className={cn('flex-1 dark:hidden', light)} />
      <span className={cn('hidden flex-1 dark:block', dark)} />
    </span>
  )
}

/** The 8-colour palette row. Selection is marked by a ring + check, never colour alone. */
function ColorPicker({
  value,
  onPick,
  namePrefix,
}: {
  value: LabelColorKey
  onPick: (key: LabelColorKey) => void
  namePrefix: string
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={`${namePrefix} warna ${key}`}
          aria-pressed={key === value}
          onClick={() => onPick(key)}
          className={cn(
            'relative grid h-6 w-6 place-content-center rounded transition-shadow motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            key === value && 'ring-2 ring-foreground',
          )}
        >
          <Swatch colorKey={key} className="absolute inset-0" />
          {key === value && <Check className="relative h-3 w-3" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

/** One existing label: inline rename, colour picker, delete-with-confirm. */
function LabelRow({
  label,
  onRename,
  onRecolor,
  onDelete,
}: {
  label: Label
  onRename: (name: string) => void
  onRecolor: (key: LabelColorKey) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label.name)
  const [confirming, setConfirming] = useState(false)

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== label.name) onRename(draft)
    else setDraft(label.name)
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <Swatch colorKey={label.colorKey} className="h-4 w-6 shrink-0" />
        {editing ? (
          <Input
            autoFocus
            maxLength={24}
            value={draft}
            aria-label={`Nama label ${label.name}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(label.name)
                setEditing(false)
              }
            }}
            className="h-7 flex-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 truncate rounded-md px-1 text-left text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label.name}
          </button>
        )}
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1 text-xs">
            <span className="text-muted-foreground">Hapus?</span>
            <Button size="sm" variant="destructive" className="h-6 px-2" onClick={onDelete}>
              Ya
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Hapus label ${label.name}`}
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <ColorPicker value={label.colorKey} onPick={onRecolor} namePrefix={label.name} />
    </li>
  )
}

/** Board-global label CRUD. Reachable from the board toolbar and the task detail Label row. */
export function LabelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const labels = usePlannerStore((s) => s.labels)
  const createLabel = usePlannerStore((s) => s.createLabel)
  const updateLabel = usePlannerStore((s) => s.updateLabel)
  const deleteLabel = usePlannerStore((s) => s.deleteLabel)

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<LabelColorKey>('slate')

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Gagal menyimpan label.')

  const add = () => {
    const name = newName
    setNewName('')
    void createLabel(name, newColor).catch(fail)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Kelola label</DialogTitle>
          {labels.length === 0 && (
            <DialogDescription>
              Belum ada label. Tambahkan label untuk mengelompokkan tugas di papan dan linimasa.
            </DialogDescription>
          )}
        </DialogHeader>

        {labels.length > 0 && (
          <ul className="space-y-1.5">
            {labels.map((l) => (
              <LabelRow
                key={l.id}
                label={l}
                onRename={(name) => void updateLabel(l.id, { name }).catch(fail)}
                onRecolor={(colorKey) => void updateLabel(l.id, { colorKey }).catch(fail)}
                onDelete={() => void deleteLabel(l.id).catch(fail)}
              />
            ))}
          </ul>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <Input
            value={newName}
            maxLength={24}
            placeholder="Nama label baru…"
            aria-label="Nama label baru"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) add()
            }}
            className="h-8"
          />
          <div className="flex items-center justify-between gap-2">
            <ColorPicker value={newColor} onPick={setNewColor} namePrefix="Label baru" />
            <Button size="sm" disabled={!newName.trim()} onClick={add}>
              Tambah
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
