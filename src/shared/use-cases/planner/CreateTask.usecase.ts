import { repositories } from '@/shared/repositories'
import type { CreateTaskDTO, Task } from '@/shared/types/productivity'

/**
 * Creates a planner task. Title is the only required field; it is trimmed before
 * storage so a whitespace-only title cannot slip past the length check.
 */
export async function createTask(userId: string, dto: CreateTaskDTO): Promise<Task> {
  const title = dto.title.trim()
  if (title.length < 1) throw new Error('Judul tugas wajib diisi')
  if (title.length > 200) throw new Error('Judul tugas maksimal 200 karakter')
  if (dto.notes !== undefined && dto.notes.length > 20000) {
    throw new Error('Catatan tugas maksimal 20.000 karakter')
  }

  return repositories.tasks.create(userId, { ...dto, title })
}
