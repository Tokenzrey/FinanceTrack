'use client'

import { useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { addAttachment } from '@/shared/use-cases/board/AddAttachment.usecase'

/** Fase 1: link-only attachments. "+ Tambah tautan" → url + name → `addAttachment`. */
export function Attachments({ task }: { task: Task }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const items = task.attachments ?? []

  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setUrl('')
    setName('')
    setAdding(false)
  }

  const submit = async () => {
    if (!uid || !url.trim()) return
    setBusy(true)
    try {
      await addAttachment(uid, task, url, name)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambah tautan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm font-semibold">Lampiran</h3>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-muted/40 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">{a.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
          <Input
            autoFocus
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            className="h-8"
            aria-label="URL tautan"
          />
          <Input
            value={name}
            placeholder="Nama (opsional)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') reset()
            }}
            className="h-8"
            aria-label="Nama tautan"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7" disabled={busy || !url.trim()} onClick={() => void submit()}>
              Tambah
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={reset}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-1.5 text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 size-3.5" aria-hidden />
          Tambah tautan
        </Button>
      )}
    </section>
  )
}
