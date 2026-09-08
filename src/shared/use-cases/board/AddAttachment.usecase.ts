import { Timestamp } from 'firebase/firestore'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/** Fase 1: link attachments only — no file upload. */
export async function addAttachment(
  userId: string,
  task: Task,
  url: string,
  name: string,
): Promise<void> {
  const trimmedUrl = url.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    throw new Error('Tautan tidak valid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Tautan tidak valid')
  }

  const clean = name.trim() || parsed.hostname
  const item = {
    id: crypto.randomUUID(),
    type: 'link' as const,
    url: trimmedUrl,
    name: clean,
    addedAt: Timestamp.now(),
  }
  await repositories.tasks.update(userId, task.id, {
    attachments: [...(task.attachments ?? []), item],
  })
}
