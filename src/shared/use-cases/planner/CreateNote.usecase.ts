import { repositories } from '@/shared/repositories'
import type { CreateNoteDTO, Note } from '@/shared/types/productivity'

/**
 * Creates a note. When no title is supplied it is derived from the first line of
 * the content, so the list view always has something to show.
 */
export async function createNote(userId: string, dto: CreateNoteDTO): Promise<Note> {
  const content = dto.content.trim()
  if (content.length === 0) throw new Error('Isi catatan wajib diisi')
  if (content.length > 20000) throw new Error('Catatan maksimal 20.000 karakter')

  const derivedTitle = content.split('\n')[0].trim().slice(0, 80)
  const title = dto.title?.trim() || derivedTitle

  return repositories.notes.create(userId, { ...dto, title })
}
