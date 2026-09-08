import { repositories } from '@/shared/repositories'
import type { Note } from '@/shared/types/productivity'

/**
 * Client-side note search: the repo has no full-text index, so we pull the list
 * and substring-match over title + content + tags. A blank keyword returns all.
 */
export async function searchNotes(userId: string, keyword: string): Promise<Note[]> {
  const all = await repositories.notes.list(userId)
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return all

  return all.filter((note) => {
    const haystack = `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase()
    return haystack.includes(needle)
  })
}
