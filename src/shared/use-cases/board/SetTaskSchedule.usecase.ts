import { repositories } from '@/shared/repositories'

/**
 * Sets a task's start and/or due instant. `FirestoreTaskRepository.update`
 * converts both `Date` fields to `Timestamp` (and `null` clears them); an
 * omitted key leaves that side untouched. `watch` pushes the new state.
 */
export async function setTaskSchedule(
  userId: string,
  taskId: string,
  patch: { startAt?: Date | null; dueAt?: Date | null },
): Promise<void> {
  await repositories.tasks.update(userId, taskId, patch)
}
