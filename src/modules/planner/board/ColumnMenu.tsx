'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { BoardList } from '@/shared/types/board'
import type { TaskStatus } from '@/shared/types/productivity'

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  doing: 'Dikerjakan',
  done: 'Selesai',
}

/** Per-column dropdown: add card, rename, remap status, WIP limit, collapse, delete. */
export function ColumnMenu({
  list,
  lists,
  onAddTask,
}: {
  list: BoardList
  lists: BoardList[]
  onAddTask: () => void
}) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(list.title)
  const [wip, setWip] = useState(list.wipLimit == null ? '' : String(list.wipLimit))

  const patch = async (data: Parameters<typeof repositories.boardLists.update>[2]) => {
    if (!uid) return
    try {
      await repositories.boardLists.update(uid, list.id, data)
    } catch {
      toast.error('Gagal menyimpan perubahan kolom.')
    }
  }

  const remove = async () => {
    if (!uid) return
    const sameStatus = lists.filter((l) => l.mapsToStatus === list.mapsToStatus)
    if (sameStatus.length <= 1) {
      toast.error(
        'Tidak bisa hapus — harus ada minimal satu kolom untuk setiap status (Backlog/Dikerjakan/Selesai).',
      )
      return
    }
    try {
      await repositories.boardLists.remove(uid, list.id)
      toast.success('Kolom dihapus')
    } catch {
      toast.error('Gagal menghapus kolom.')
    }
  }

  const commitRename = () => {
    const next = name.trim().slice(0, 40)
    setRenaming(false)
    if (next && next !== list.title) void patch({ title: next })
    else setName(list.title)
  }

  const commitWip = () => {
    const trimmed = wip.trim()
    const next = trimmed === '' ? null : Math.max(1, Math.floor(Number(trimmed)))
    if (trimmed !== '' && !Number.isFinite(next as number)) {
      setWip(list.wipLimit == null ? '' : String(list.wipLimit))
      return
    }
    if (next !== list.wipLimit) void patch({ wipLimit: next })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Aksi kolom ${list.title}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onAddTask}>Tambah tugas</DropdownMenuItem>

        {renaming ? (
          <div className="p-1.5">
            <Input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setRenaming(false)
                  setName(list.title)
                }
              }}
              onBlur={commitRename}
              className="h-8"
              aria-label="Nama kolom"
            />
          </div>
        ) : (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setRenaming(true) }}>
            Ganti nama
          </DropdownMenuItem>
        )}

        <div className="px-2 py-1.5">
          <p className="mb-1 text-xs text-muted-foreground">Pilih status</p>
          <Select
            value={list.mapsToStatus}
            onValueChange={(v) => void patch({ mapsToStatus: v as TaskStatus })}
          >
            <SelectTrigger className="h-8" aria-label="Status kolom">
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
        </div>

        <div className="px-2 py-1.5">
          <p className="mb-1 text-xs text-muted-foreground">Atur batas WIP</p>
          <Input
            type="number"
            min={1}
            value={wip}
            placeholder="Tanpa batas"
            onChange={(e) => setWip(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitWip()
            }}
            onBlur={commitWip}
            className="h-8"
            aria-label="Batas WIP"
          />
        </div>

        <DropdownMenuItem
          onSelect={() => void patch({ isCollapsed: !list.isCollapsed })}
        >
          {list.isCollapsed ? 'Buka' : 'Ciutkan'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void remove()}
          className="text-destructive focus:text-destructive"
        >
          Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
