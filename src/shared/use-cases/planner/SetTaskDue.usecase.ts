import { repositories } from '@/shared/repositories'

/**
 * Sets (or clears) a task's due date and, when a date is given, spawns one
 * standalone reminder per lead time that still falls in the future.
 *
 * ponytail: no upsert — a re-set of dueAt stacks reminders; acceptable for MVP,
 * revisit if users complain. Clearing dueAt does not delete reminders already
 * created for the web path — reminder cleanup there is out of scope for MVP.
 */
export async function setTaskDue(
  userId: string,
  taskId: string,
  dueAt: Date | null,
  leadsMinutes: number[],
): Promise<void> {
  if (dueAt === null) {
    await repositories.tasks.update(userId, taskId, { dueAt: null })
    return
  }

  await repositories.tasks.update(userId, taskId, { dueAt })

  for (const lead of leadsMinutes) {
    const remindAtMs = dueAt.getTime() - lead * 60000
    if (remindAtMs > Date.now()) {
      await repositories.reminders.create(userId, {
        message: 'Pengingat tugas',
        remindAt: new Date(remindAtMs),
        source: 'web',
      })
    }
  }
}
