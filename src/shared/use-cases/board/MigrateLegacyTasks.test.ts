import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_GAP } from '@/shared/lib/rank'
import type { Timestamp } from 'firebase/firestore'

const listLists = vi.fn()
const listTasks = vi.fn()
const updateTask = vi.fn()

vi.mock('@/shared/repositories', () => ({
  repositories: {
    boardLists: { list: (...a: unknown[]) => listLists(...a) },
    tasks: {
      list: (...a: unknown[]) => listTasks(...a),
      update: (...a: unknown[]) => updateTask(...a),
    },
  },
}))

const { migrateLegacyTasks } = await import('./MigrateLegacyTasks.usecase')

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Timestamp

const LISTS = [
  { id: 'list-todo', order: RANK_GAP, mapsToStatus: 'todo' },
  { id: 'list-doing', order: 2 * RANK_GAP, mapsToStatus: 'doing' },
  { id: 'list-done', order: 3 * RANK_GAP, mapsToStatus: 'done' },
]

beforeEach(() => {
  listLists.mockReset().mockResolvedValue(LISTS)
  listTasks.mockReset()
  updateTask.mockReset().mockResolvedValue(undefined)
})

describe('migrateLegacyTasks', () => {
  it('assigns listId + spaced order to every task without a listId', async () => {
    listTasks.mockResolvedValue([
      { id: 't-todo-b', status: 'todo', listId: null, createdAt: ts(2000) },
      { id: 't-todo-a', status: 'todo', listId: undefined, createdAt: ts(1000) },
      { id: 't-doing', status: 'doing', listId: null, createdAt: ts(500) },
      { id: 't-has-list', status: 'todo', listId: 'list-todo', order: 42, createdAt: ts(100) },
    ])

    await migrateLegacyTasks('u1')

    // the pre-assigned task is untouched
    expect(updateTask).toHaveBeenCalledTimes(3)
    expect(updateTask).not.toHaveBeenCalledWith('u1', 't-has-list', expect.anything())

    // todo group ordered by createdAt ascending → t-todo-a first
    expect(updateTask).toHaveBeenCalledWith('u1', 't-todo-a', {
      listId: 'list-todo',
      order: RANK_GAP,
    })
    expect(updateTask).toHaveBeenCalledWith('u1', 't-todo-b', {
      listId: 'list-todo',
      order: 2 * RANK_GAP,
    })
    expect(updateTask).toHaveBeenCalledWith('u1', 't-doing', {
      listId: 'list-doing',
      order: RANK_GAP,
    })
  })

  it('is idempotent — no writes when every task already has a listId', async () => {
    listTasks.mockResolvedValue([
      { id: 't1', status: 'todo', listId: 'list-todo', order: RANK_GAP, createdAt: ts(1) },
      { id: 't2', status: 'done', listId: 'list-done', order: RANK_GAP, createdAt: ts(2) },
    ])

    await migrateLegacyTasks('u1')

    expect(updateTask).not.toHaveBeenCalled()
  })

  it('returns early when no lists exist', async () => {
    listLists.mockResolvedValue([])

    await migrateLegacyTasks('u1')

    expect(listTasks).not.toHaveBeenCalled()
    expect(updateTask).not.toHaveBeenCalled()
  })
})
