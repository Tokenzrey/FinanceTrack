import { formatDayLong } from '@/shared/lib/format'
import type { Task, UpdateTaskDTO } from '@/shared/types/productivity'
import { getUserTimezone } from './admin-data'
import * as data from './admin-data-productivity'
import type { ProductivityCommand } from './productivity-commands'
import * as replies from './replies-productivity'
import type { TaskCardContext } from './replies-productivity'
import type { BotReply } from './types'

/**
 * The integration layer for the productivity suite: a parsed `ProductivityCommand`
 * (`productivity-commands.ts`) in, a `BotReply` out. Every branch is a straight
 * translation — data-layer call(s) from `admin-data-productivity.ts`, reply copy from
 * `replies-productivity.ts`. Task 9 wires this into `dispatchText`.
 *
 * Returns `null` ONLY for `kind: 'none'`, so the dispatcher falls through to the
 * finance-transaction parser.
 */

/** Earliest `dueAt - lead` moment still in the future, or `null` if every lead has
 *  already passed. "Earliest" = soonest to fire. */
function firstFutureReminder(dueAt: Date, leadsMinutes: number[]): Date | null {
  const now = Date.now()
  const upcoming = leadsMinutes
    .map((lead) => dueAt.getTime() - lead * 60_000)
    .filter((ms) => ms > now)
    .sort((a, b) => a - b)
  return upcoming.length > 0 ? new Date(upcoming[0]) : null
}

/** Resolve each task's board column name (from `listId`) and label names (from `labelIds`)
 *  so the reply cards can show a 📁 / 🏷 line. Two extra Firestore reads per command —
 *  acceptable: the bot is single-user and `/tugas` / `/agenda` / task-add are infrequent.
 *  A lists/labels read failure (rules, network) degrades to today's context-free card. */
async function buildTaskCardContext(
  userId: string,
  tasks: Task[],
): Promise<Map<string, TaskCardContext>> {
  const out = new Map<string, TaskCardContext>()
  if (tasks.every((t) => !t.listId && !t.labelIds?.length)) return out
  try {
    const [lists, labels] = await Promise.all([
      data.getBoardLists(userId),
      data.getBoardLabels(userId),
    ])
    const listNameById = new Map(lists.map((l) => [l.id, l.title]))
    const labelNameById = new Map(labels.map((l) => [l.id, l.name]))
    for (const t of tasks) {
      out.set(t.id, {
        columnName: t.listId ? (listNameById.get(t.listId) ?? null) : null,
        labelNames: (t.labelIds ?? [])
          .map((id) => labelNameById.get(id))
          .filter((n): n is string => Boolean(n)),
      })
    }
  } catch {
    return new Map()
  }
  return out
}

/** First line of a note, trimmed to ~60 chars — used as the note title. */
function deriveNoteTitle(text: string): string {
  const firstLine = text.split('\n')[0].trim()
  return firstLine.length > 60 ? `${firstLine.slice(0, 59).trimEnd()}…` : firstLine
}

/** `tz` is passed in by `dispatchText`, which already resolved it to parse the command —
 *  the token (`pr:*`) path has no parse step, so it falls back to a read here. */
export async function handleProductivityCommand(
  userId: string,
  cmd: ProductivityCommand,
  source: 'whatsapp' | 'telegram' = 'telegram',
  timeZone?: string,
): Promise<BotReply | null> {
  if (cmd.kind === 'none') return null

  const tz = timeZone ?? (await getUserTimezone(userId))

  switch (cmd.kind) {
    case 'task_add': {
      let task = await data.createTask(userId, {
        title: cmd.title,
        priority: cmd.priority ?? undefined,
        source,
      })
      let firstReminderAt: Date | null = null
      if (cmd.when) {
        const prefs = await data.getPlannerPrefs(userId)
        task = await data.updateTask(userId, task.id, { dueAt: cmd.when.at })
        await data.upsertTaskReminder(userId, task, prefs.taskLeadsMinutes)
        firstReminderAt = firstFutureReminder(cmd.when.at, prefs.taskLeadsMinutes)
      }
      const ctxById = await buildTaskCardContext(userId, [task])
      return replies.taskCreated(task, tz, firstReminderAt, ctxById.get(task.id))
    }

    case 'task_list': {
      const items = await data.listTasks(userId, cmd.filter, tz)
      const ctxById = await buildTaskCardContext(userId, items)
      return replies.taskList(items, cmd.filter, tz, ctxById)
    }

    case 'agenda': {
      const now = new Date()
      const [tasks, reminders] = await Promise.all([
        data.listTasks(userId, 'today', tz),
        data.listRemindersForDay(userId, now, tz),
      ])
      const ctxById = await buildTaskCardContext(userId, tasks)
      return replies.agenda(tasks, reminders, tz, formatDayLong(now, tz), ctxById)
    }

    case 'task_done': {
      const task = await data.getTaskByIndex(userId, 'open', tz, cmd.ref)
      if (!task) return replies.taskRefNotFound(cmd.ref)
      const updated = await data.updateTask(userId, task.id, { status: 'done' })
      await data.cancelRemindersForTask(userId, task.id)
      return replies.taskDone(updated)
    }

    case 'task_rm': {
      const task = await data.getTaskByIndex(userId, 'open', tz, cmd.ref)
      if (!task) return replies.taskRefNotFound(cmd.ref)
      await data.deleteTask(userId, task.id)
      await data.cancelRemindersForTask(userId, task.id)
      return replies.taskRemoved(task.title)
    }

    case 'task_edit': {
      const task = await data.getTaskByIndex(userId, 'open', tz, cmd.ref)
      if (!task) return replies.taskRefNotFound(cmd.ref)
      const patch: UpdateTaskDTO = {}
      if (cmd.patch.title !== undefined) patch.title = cmd.patch.title
      if (cmd.patch.priority !== undefined) patch.priority = cmd.patch.priority
      if (cmd.patch.when) patch.dueAt = cmd.patch.when.at
      const updated = await data.updateTask(userId, task.id, patch)
      let firstReminderAt: Date | null = null
      if (cmd.patch.when) {
        const prefs = await data.getPlannerPrefs(userId)
        await data.upsertTaskReminder(userId, updated, prefs.taskLeadsMinutes)
        firstReminderAt = firstFutureReminder(cmd.patch.when.at, prefs.taskLeadsMinutes)
      }
      const ctxById = await buildTaskCardContext(userId, [updated])
      return replies.taskCreated(updated, tz, firstReminderAt, ctxById.get(updated.id))
    }

    case 'note_add': {
      const note = await data.createNote(userId, {
        title: deriveNoteTitle(cmd.text),
        content: cmd.text,
        source,
      })
      return replies.noteSaved(note)
    }

    case 'note_search': {
      const items = await data.searchNotes(userId, cmd.keyword)
      return replies.noteSearchResult(cmd.keyword, items)
    }

    case 'note_list': {
      const items = await data.listNotes(userId)
      return replies.noteList(items)
    }

    case 'reminder_add': {
      const reminder = await data.createReminder(
        userId,
        {
          message: cmd.message,
          remindAt: cmd.when.at,
          recurrence: cmd.when.recurrence ?? null,
          source,
        },
        { kind: 'standalone', taskId: null },
      )
      return replies.reminderSet(reminder, tz)
    }

    case 'snooze': {
      const id = cmd.reminderId ?? (await data.getPlannerLastPush(userId))
      if (!id) return replies.noRecentReminder()
      const src = await data.getReminderById(userId, id)
      if (!src) return replies.noRecentReminder()
      const snoozed = await data.createReminder(
        userId,
        {
          message: src.message,
          remindAt: new Date(Date.now() + cmd.minutes * 60_000),
          recurrence: null,
          source,
        },
        { kind: src.kind, taskId: src.taskId },
      )
      return replies.snoozed(snoozed, tz)
    }

    case 'mark_done_token': {
      const r = await data.getReminderById(userId, cmd.reminderId)
      if (!r) return replies.reminderGone()
      if (r.kind === 'task' && r.taskId) {
        const task = await data.updateTask(userId, r.taskId, { status: 'done' })
        await data.cancelRemindersForTask(userId, r.taskId)
        return replies.taskDone(task)
      }
      return replies.reminderMarkedDone()
    }
  }
}
