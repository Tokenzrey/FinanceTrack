'use client'

import { useEffect, useState } from 'react'
import { Loader2, MoreHorizontal, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { ModalFormShell } from '@/shared/components/ui/modal-form-shell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import { useNotesStore } from '@/shared/stores/notes.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Note } from '@/shared/types/productivity'

/** Comma-separated tag string → cleaned list. Repo `normalizeTags` still has the final say. */
function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function NoteSearchBar() {
  const setQuery = useNotesStore((s) => s.setQuery)
  const [text, setText] = useState('')

  // Debounce 250ms — one store write per pause, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text), 250)
    return () => clearTimeout(id)
  }, [text, setQuery])

  return (
    <Input
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder="Cari catatan…"
      aria-label="Cari catatan"
    />
  )
}

function TagFilter({
  tags,
  active,
  onToggle,
}: {
  tags: string[]
  active: string | null
  onToggle: (tag: string | null) => void
}) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Button
          key={tag}
          size="sm"
          variant={active === tag ? 'default' : 'outline'}
          onClick={() => onToggle(active === tag ? null : tag)}
        >
          #{tag}
        </Button>
      ))}
    </div>
  )
}

function NoteEditor({
  note,
  open,
  onOpenChange,
}: {
  note: Note | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addNote = useNotesStore((s) => s.addNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    const body = content.trim()
    if (!body) {
      toast.error('Isi catatan wajib diisi')
      return
    }

    setSaving(true)
    try {
      if (note) {
        await updateNote(note.id, { title: title.trim(), content: body, tags: parseTags(tags) })
        toast.success('Catatan diperbarui')
      } else {
        await addNote({
          title: title.trim() || undefined,
          content: body,
          tags: parseTags(tags),
          source: 'web',
        })
        toast.success('Catatan disimpan')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan catatan')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }

  return (
    <ModalFormShell
      open={open}
      onOpenChange={onOpenChange}
      title={note ? 'Edit catatan' : 'Catatan baru'}
      size="md"
      footer={
        <Button
          className="w-full sm:w-auto"
          disabled={saving || !content.trim()}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Simpan
        </Button>
      }
    >
      <div className="space-y-4" onKeyDown={onKeyDown}>
        <div className="space-y-1.5">
          <Label htmlFor="note-title" className="text-xs">
            Judul
          </Label>
          <Input
            id="note-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Judul (opsional)"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-content" className="text-xs">
            Isi
          </Label>
          <Textarea
            id="note-content"
            value={content}
            rows={8}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Tulis catatan…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-tags" className="text-xs">
            Tag
          </Label>
          <Input
            id="note-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Pisahkan dengan koma"
          />
        </div>
      </div>
    </ModalFormShell>
  )
}

function NoteCard({
  note,
  tz,
  onView,
  onEdit,
}: {
  note: Note
  tz: string
  onView: () => void
  onEdit: () => void
}) {
  const removeNote = useNotesStore((s) => s.removeNote)

  const remove = async () => {
    try {
      await removeNote(note.id)
      toast.success('Catatan dihapus')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus catatan')
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onView}
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="truncate text-sm font-semibold">{note.title || 'Tanpa judul'}</p>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {note.content || 'Ketuk untuk membaca'}
            </p>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Aksi ${note.title || 'catatan'}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void remove()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {note.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDateTime(note.updatedAt.toDate(), tz)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** Read-only note view. The `⋯` menu still has Edit/Delete; this is the "just
 *  let me read it" path the card body opens. */
function NoteReader({
  note,
  tz,
  open,
  onOpenChange,
  onEdit,
}: {
  note: Note | null
  tz: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
}) {
  if (!note) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left">{note.title || 'Tanpa judul'}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <p className="whitespace-pre-wrap break-words text-sm">
            {note.content || <span className="text-muted-foreground">Catatan ini kosong.</span>}
          </p>

          {note.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {note.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="truncate text-xs text-muted-foreground">
            Diperbarui {formatDateTime(note.updatedAt.toDate(), tz)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onEdit()
            }}
          >
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NotesPage() {
  const notes = useNotesStore((s) => s.notes)
  const isLoading = useNotesStore((s) => s.isLoading)
  const query = useNotesStore((s) => s.query)
  const tz = useAuthStore((s) => s.profile?.timezone) ?? DEFAULT_TZ
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<Note | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [viewing, setViewing] = useState<Note | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)

  // `subscribe()` returns its own unsubscribe — hand it straight back to the effect.
  useEffect(() => useNotesStore.getState().subscribe(), [])

  const needle = query.trim().toLowerCase()
  const allTags = Array.from(new Set(notes.flatMap((note) => note.tags))).sort()

  // Client-side filter: tag chip AND lowercase substring over title + content + tags.
  const shown = notes
    .filter((note) => !activeTag || note.tags.includes(activeTag))
    .filter((note) =>
      needle
        ? `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase().includes(needle)
        : true,
    )
    .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (note: Note) => {
    setEditing(note)
    setEditorOpen(true)
  }
  const openView = (note: Note) => {
    setViewing(note)
    setReaderOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catatan"
        description="Simpan catatan dan ide, cari cepat lewat kata kunci atau tag."
        actions={<Button onClick={openNew}>＋ Catatan baru</Button>}
      />

      <NoteSearchBar />
      <TagFilter tags={allTags} active={activeTag} onToggle={setActiveTag} />

      {isLoading && notes.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="Belum ada catatan"
          description="Belum ada catatan — tulis yang pertama."
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((note) => (
            <li key={note.id}>
              <NoteCard
                note={note}
                tz={tz}
                onView={() => openView(note)}
                onEdit={() => openEdit(note)}
              />
            </li>
          ))}
        </ul>
      )}

      <NoteReader
        note={viewing}
        tz={tz}
        open={readerOpen}
        onOpenChange={setReaderOpen}
        onEdit={() => viewing && openEdit(viewing)}
      />

      {editorOpen && (
        <NoteEditor
          key={editing?.id ?? 'new'}
          note={editing}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      )}
    </div>
  )
}
