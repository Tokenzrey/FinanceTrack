'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { formatDateTime } from '@/shared/lib/format'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { addProgressNote } from '@/shared/use-cases/board/AddProgressNote.usecase'

/** Timestamped entries, newest on top. Not "Komentar" — there is no one else. */
export function ProgressNotes({ task, tz }: { task: Task; tz: string }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const notes = useMemo(
    () =>
      [...(task.progressNotes ?? [])].sort(
        (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis(),
      ),
    [task.progressNotes],
  )

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const body = draft.trim()
    if (!body || !uid) return
    setBusy(true)
    try {
      await addProgressNote(uid, task, body)
      setDraft('')
    } catch {
      toast.error('Gagal menambah catatan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm font-semibold">Catatan progres</h3>

      <div className="space-y-1.5">
        <Textarea
          value={draft}
          maxLength={2000}
          rows={2}
          placeholder="Tulis catatan progres…"
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Catatan progres baru"
        />
        <Button size="sm" className="h-7" disabled={busy || !draft.trim()} onClick={() => void submit()}>
          Tambah catatan
        </Button>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {formatDateTime(n.createdAt.toDate(), tz)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
