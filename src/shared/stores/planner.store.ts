'use client'

import { create } from 'zustand'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import { repositories } from '@/shared/repositories'
import { createTask } from '@/shared/use-cases/planner/CreateTask.usecase'
import { updateTaskStatus } from '@/shared/use-cases/planner/UpdateTaskStatus.usecase'
import { setTaskDue } from '@/shared/use-cases/planner/SetTaskDue.usecase'
import { cancelReminder } from '@/shared/use-cases/planner/CancelReminder.usecase'
import type { BoardList, BoardFilters, Label } from '@/shared/types/board'
import { EMPTY_BOARD_FILTERS } from '@/shared/types/board'
import type { CreateTaskDTO, Reminder, Task, TaskStatus } from '@/shared/types/productivity'
import { useAuthStore } from './auth.store'

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

type BoardView = 'board' | 'timeline' | 'list'

function isBoardView(v: unknown): v is BoardView {
  return v === 'board' || v === 'timeline' || v === 'list'
}

interface PlannerStore {
  tasks: Task[]
  reminders: Reminder[]
  isLoading: boolean
  // ─── Board slice ───
  lists: BoardList[]
  labels: Label[]
  activeView: BoardView
  filters: BoardFilters
  draggingId: string | null
  /** Task id whose detail panel is open, or `null`. The panel reads the task from `tasks`. */
  detailTaskId: string | null
  /** Wires `repositories.tasks.watch`; returns the unsubscribe. No-op when signed out. */
  subscribe: () => () => void
  /** Wires `repositories.reminders.watch`; returns the unsubscribe. No-op when signed out. */
  subscribeReminders: () => () => void
  /**
   * Wires `boardLists.watch` + `labels.watch` and hydrates `activeView` once from
   * `users/{uid}/meta/boardPrefs`. Returns a single unsubscribe covering both watches.
   * No-op when signed out.
   */
  subscribeBoardMeta: () => () => void
  /** Optimistic; fire-and-forget persist to `meta/boardPrefs`. A failed persist just resets next session. */
  setActiveView: (v: BoardView) => void
  setFilters: (patch: Partial<BoardFilters>) => void
  clearFilters: () => void
  setDraggingId: (id: string | null) => void
  openTask: (id: string) => void
  closeTask: () => void
  /** Tasks in one column, sorted ascending by `order` (missing `order` treated as 0). */
  tasksInList: (listId: string) => Task[]
  /** Returns the created task so the caller can chain a `setDue` on its id. */
  addTask: (dto: CreateTaskDTO) => Promise<Task>
  setStatus: (id: string, status: TaskStatus) => Promise<void>
  setDue: (id: string, title: string, dueAt: Date | null, leads: number[]) => Promise<void>
  removeTask: (id: string) => Promise<void>
  cancelReminderById: (id: string) => Promise<void>
}

/** Writes never re-fetch — `watch` pushes the new list. */
export const usePlannerStore = create<PlannerStore>((set, get) => ({
  tasks: [],
  reminders: [],
  isLoading: false,
  lists: [],
  labels: [],
  activeView: 'board',
  filters: EMPTY_BOARD_FILTERS,
  draggingId: null,
  detailTaskId: null,

  subscribe: () => {
    const uid = currentUserId()
    if (!uid) return () => {}
    set({ isLoading: true })
    return repositories.tasks.watch(uid, (tasks) => set({ tasks, isLoading: false }))
  },

  subscribeReminders: () => {
    const uid = currentUserId()
    if (!uid) return () => {}
    return repositories.reminders.watch(uid, (reminders) => set({ reminders }))
  },

  subscribeBoardMeta: () => {
    const uid = currentUserId()
    if (!uid) return () => {}

    getDoc(doc(getDb(), 'users', uid, 'meta', 'boardPrefs'))
      .then((snap) => {
        const view = snap.data()?.activeView
        if (isBoardView(view)) set({ activeView: view })
      })
      .catch(() => {})

    const unsubLists = repositories.boardLists.watch(uid, (lists) => set({ lists }))
    const unsubLabels = repositories.labels.watch(uid, (labels) => set({ labels }))
    return () => {
      unsubLists()
      unsubLabels()
    }
  },

  setActiveView: (v) => {
    set({ activeView: v })
    const uid = currentUserId()
    if (!uid) return
    setDoc(doc(getDb(), 'users', uid, 'meta', 'boardPrefs'), { activeView: v }, { merge: true }).catch(
      () => {},
    )
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

  clearFilters: () => set({ filters: EMPTY_BOARD_FILTERS }),

  setDraggingId: (id) => set({ draggingId: id }),

  openTask: (id) => set({ detailTaskId: id }),

  closeTask: () => set({ detailTaskId: null }),

  tasksInList: (listId) =>
    get()
      .tasks.filter((task) => task.listId === listId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),

  addTask: async (dto) => {
    const uid = currentUserId()
    if (!uid) throw new Error('Belum masuk')
    return createTask(uid, dto)
  },

  setStatus: async (id, status) => {
    const uid = currentUserId()
    if (!uid) return
    await updateTaskStatus(uid, id, status)
  },

  setDue: async (id, title, dueAt, leads) => {
    const uid = currentUserId()
    if (!uid) return
    await setTaskDue(uid, id, title, dueAt, leads)
  },

  removeTask: async (id) => {
    const uid = currentUserId()
    if (!uid) return
    await repositories.tasks.remove(uid, id)
  },

  cancelReminderById: async (id) => {
    const uid = currentUserId()
    if (!uid) return
    await cancelReminder(uid, id)
  },
}))
