'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import { createTask } from '@/shared/use-cases/planner/CreateTask.usecase'
import { updateTaskStatus } from '@/shared/use-cases/planner/UpdateTaskStatus.usecase'
import { setTaskDue } from '@/shared/use-cases/planner/SetTaskDue.usecase'
import type { CreateTaskDTO, Task, TaskStatus } from '@/shared/types/productivity'
import { useAuthStore } from './auth.store'

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

interface PlannerStore {
  tasks: Task[]
  isLoading: boolean
  /** Wires `repositories.tasks.watch`; returns the unsubscribe. No-op when signed out. */
  subscribe: () => () => void
  /** Returns the created task so the caller can chain a `setDue` on its id. */
  addTask: (dto: CreateTaskDTO) => Promise<Task>
  setStatus: (id: string, status: TaskStatus) => Promise<void>
  setDue: (id: string, dueAt: Date | null, leads: number[]) => Promise<void>
  removeTask: (id: string) => Promise<void>
}

/** Writes never re-fetch — `watch` pushes the new list. */
export const usePlannerStore = create<PlannerStore>((set) => ({
  tasks: [],
  isLoading: false,

  subscribe: () => {
    const uid = currentUserId()
    if (!uid) return () => {}
    set({ isLoading: true })
    return repositories.tasks.watch(uid, (tasks) => set({ tasks, isLoading: false }))
  },

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

  setDue: async (id, dueAt, leads) => {
    const uid = currentUserId()
    if (!uid) return
    await setTaskDue(uid, id, dueAt, leads)
  },

  removeTask: async (id) => {
    const uid = currentUserId()
    if (!uid) return
    await repositories.tasks.remove(uid, id)
  },
}))
