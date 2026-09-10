'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Textarea } from '@/shared/components/ui/textarea'
import { formatDateTime } from '@/shared/lib/format'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Task } from '@/shared/types/productivity'
import { addProgressNote } from '@/shared/use-cases/board/AddProgressNote.usecase'

/** The form the modal footer's "Tambah catatan" button submits. */
export const PROGRESS_NOTE_FORM_ID = 'progress-note-form'

/**
 * Timestamped entries, newest on top. Not "Komentar" — there is no one else.
 * The submit control lives in the modal footer (see `TaskDetailPanel`), wired here
 * through `PROGRESS_NOTE_FORM_ID`; `onDraftStateChange` keeps that button's
 * enabled/busy state in sync.
 */
export function ProgressNotes({
  task,
  tz,
  onDraftStateChange,
}: {
  task: Task
  tz: string
  onDraftStateChange?: (state: { hasText: boolean; busy: boolean }) => void
}) {
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

  useEffect(() => {
    onDraftStateChange?.({ hasText: draft.trim().length > 0, busy })
  }, [draft, busy, onDraftStateChange])

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

      <form
        id={PROGRESS_NOTE_FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Textarea
          value={draft}
          maxLength={2000}
          rows={3}
          placeholder="Tulis catatan progres…"
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Catatan progres baru"
        />
      </form>

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
