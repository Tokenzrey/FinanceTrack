import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'

/**
 * Sets (or clears) a task's due date and, when a date is given, spawns one
 * standalone reminder per lead time that still falls in the future.
 *
 * The message matches the bot's `upsertTaskReminder` copy verbatim, so a reminder
 * created from the web reads the same in chat as one created from the bot.
 *
 * ponytail: no upsert — a re-set of dueAt stacks reminders; acceptable for MVP,
 * revisit if users complain. Clearing dueAt does not delete reminders already
 * created for the web path — reminder cleanup there is out of scope for MVP.
 * ponytail: the due label is formatted in DEFAULT_TZ, not the user's profile zone;
 * thread a tz param through the store if a non-WIB user ever reports it.
 */
export async function setTaskDue(
  userId: string,
  taskId: string,
  taskTitle: string,
  dueAt: Date | null,
  leadsMinutes: number[],
): Promise<void> {
  if (dueAt === null) {
    await repositories.tasks.update(userId, taskId, { dueAt: null })
    return
  }

  await repositories.tasks.update(userId, taskId, { dueAt })

  const message = `⏰ Tugas: ${taskTitle} — jatuh tempo ${formatDateTime(dueAt, DEFAULT_TZ)}`
  for (const lead of leadsMinutes) {
    const remindAtMs = dueAt.getTime() - lead * 60000
    if (remindAtMs > Date.now()) {
      await repositories.reminders.create(userId, {
        message,
        remindAt: new Date(remindAtMs),
        source: 'web',
      })
    }
  }
}
