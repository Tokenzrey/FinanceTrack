import { DEFAULT_TZ, formatDateTime } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'
import type { Task } from '@/shared/types/productivity'

/**
 * Sets a task's start and/or due instant, then rebuilds its automatic reminders:
 * cancels the task's still-pending auto-reminders, then re-creates one per lead
 * time for whichever of `startAt` / `dueAt` ends up set and still future (a field
 * the patch omits keeps the value already on `task`).
 *
 * `startAt` → a "mulai kerjakan" reminder (plan §0 #10). `dueAt` → a "jatuh
 * tempo" reminder, matching `setTaskDue`'s copy. Unlike `setTaskDue` this DOES
 * upsert (cancel-then-recreate) — the timeline drag hits this on every drop, so
 * stacking would be unusable.
 *
 * `FirestoreTaskRepository.update` converts `Date`→`Timestamp`, `null` clears,
 * an omitted key leaves that side untouched. Clearing a field therefore also
 * drops its reminders, because the cancel runs regardless of the new values.
 *
 * ponytail: the cancel scans `listUpcoming` (all pending/failed reminders) and
 * filters by `taskId` client-side — `IReminderRepository` has no per-task query
 * and a user's pending set is tens of docs. Add a `where('taskId','==',…)` read
 * if that set ever grows into the hundreds.
 * ponytail: labels are formatted in DEFAULT_TZ, not the user's profile zone —
 * same gap as `setTaskDue`; thread a tz param through if a non-WIB user reports it.
 */
export async function setTaskSchedule(
  userId: string,
  task: Pick<Task, 'id' | 'title' | 'startAt' | 'dueAt'>,
  patch: { startAt?: Date | null; dueAt?: Date | null },
  leadsMinutes: number[],
): Promise<void> {
  await repositories.tasks.update(userId, task.id, patch)

  // The rebuild covers BOTH fields, so an untouched side is resolved from the task
  // itself — otherwise a startAt-only drag would cancel the dueAt reminders and
  // never bring them back.
  const resolve = (key: 'startAt' | 'dueAt'): Date | null => {
    if (key in patch) return patch[key] ?? null
    return task[key]?.toDate() ?? null
  }
  const startAt = resolve('startAt')
  const dueAt = resolve('dueAt')

  const pending = await repositories.reminders.listUpcoming(userId)
  for (const r of pending) {
    if (r.taskId === task.id && r.status === 'pending') {
      await repositories.reminders.cancel(userId, r.id)
    }
  }

  const spawn = async (instant: Date, message: string) => {
    for (const lead of leadsMinutes) {
      const remindAtMs = instant.getTime() - lead * 60000
      if (remindAtMs > Date.now()) {
        await repositories.reminders.create(userId, {
          message,
          remindAt: new Date(remindAtMs),
          source: 'web',
          taskId: task.id,
        })
      }
    }
  }

  if (startAt) {
    await spawn(
      startAt,
      `▶️ Tugas: ${task.title} — waktunya mulai ${formatDateTime(startAt, DEFAULT_TZ)}`,
    )
  }
  if (dueAt) {
    await spawn(dueAt, `⏰ Tugas: ${task.title} — jatuh tempo ${formatDateTime(dueAt, DEFAULT_TZ)}`)
  }
}
