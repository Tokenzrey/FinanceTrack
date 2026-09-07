import type { Timestamp } from 'firebase/firestore'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'med' | 'high'
export type ReminderStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type ReminderFreq = 'daily' | 'weekly' | 'weekday'
export type EntrySource = 'web' | 'whatsapp' | 'telegram'

export interface Task {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: TaskPriority
  dueAt: Timestamp | null
  doneAt: Timestamp | null
  source: EntrySource
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  source: EntrySource
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ReminderRecurrence {
  freq: ReminderFreq
  /** 0..6 (0 = Sunday, Date.getUTCDay convention). Required for 'weekly', ignored otherwise. */
  weekday?: number
  until: Timestamp | null
}

export interface Reminder {
  id: string
  ownerId: string
  kind: 'task' | 'standalone'
  taskId: string | null
  message: string
  remindAt: Timestamp
  status: ReminderStatus
  attempts: number
  nextAttemptAt: Timestamp | null
  lastError: string | null
  sentAt: Timestamp | null
  recurrence: ReminderRecurrence | null
  source: EntrySource | 'auto'
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── DTOs (input from web/bot; no server id/timestamps) ───
export interface CreateTaskDTO {
  title: string
  notes?: string
  priority?: TaskPriority
  dueAt?: Date | null
  source: EntrySource
}
export interface UpdateTaskDTO {
  title?: string
  notes?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: Date | null
}
export interface CreateNoteDTO {
  title?: string
  content: string
  tags?: string[]
  source: EntrySource
}
export interface CreateReminderDTO {
  message: string
  remindAt: Date
  recurrence?: { freq: ReminderFreq; until?: Date | null } | null
  source: EntrySource
}

/** Default lead time (minutes before dueAt) for a task's automatic reminder.
 *  User can override in Settings; stored at users/{uid}/meta/plannerPrefs. */
export interface PlannerPrefs {
  /** Minutes before the due time. [0] = "on time". Default [0, 60]. */
  taskLeadsMinutes: number[]
  /** Local hour (0..23) the morning digest is sent. Default 7. */
  digestHour: number
  /** Morning digest enabled. Default true. */
  digestEnabled: boolean
}
export const DEFAULT_PLANNER_PREFS: PlannerPrefs = {
  taskLeadsMinutes: [0, 60],
  digestHour: 7,
  digestEnabled: true,
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === 'todo' || v === 'doing' || v === 'done'
}
export function isTaskPriority(v: unknown): v is TaskPriority {
  return v === 'low' || v === 'med' || v === 'high'
}
export function isReminderFreq(v: unknown): v is ReminderFreq {
  return v === 'daily' || v === 'weekly' || v === 'weekday'
}
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const clean = t.trim().toLowerCase().slice(0, 30)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length === 12) break
  }
  return out
}
