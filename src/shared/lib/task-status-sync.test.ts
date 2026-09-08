import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import type { BoardList } from '@/shared/types/board'
import { statusForList, listForStatus, reconcile } from './task-status-sync'

describe('task-status-sync', () => {
  // Fixture: 4 lists (Backlog→todo at order 1000, Doing→doing at order 2000,
  // Done→done at order 3000, Extra→todo at order 4000 to test "first by order")
  const now = new Date() as unknown as Timestamp
  const lists: BoardList[] = [
    {
      id: 'backlog-list-id',
      title: 'Backlog',
      order: 1000,
      mapsToStatus: 'todo',
      wipLimit: null,
      isCollapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'doing-list-id',
      title: 'Doing',
      order: 2000,
      mapsToStatus: 'doing',
      wipLimit: null,
      isCollapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'done-list-id',
      title: 'Done',
      order: 3000,
      mapsToStatus: 'done',
      wipLimit: null,
      isCollapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'extra-todo-list-id',
      title: 'Extra Todo',
      order: 4000,
      mapsToStatus: 'todo',
      wipLimit: null,
      isCollapsed: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  describe('statusForList', () => {
    it('returns mapsToStatus of the matching list', () => {
      expect(statusForList('doing-list-id', lists)).toBe('doing')
    })

    it('returns "todo" when listId is null', () => {
      expect(statusForList(null, lists)).toBe('todo')
    })

    it('returns "todo" when listId refers to a nonexistent list', () => {
      expect(statusForList('nonexistent', lists)).toBe('todo')
    })
  })

  describe('listForStatus', () => {
    it('returns the first list (by order) with matching mapsToStatus for "todo"', () => {
      // Should return Backlog (order 1000), NOT Extra (order 4000)
      expect(listForStatus('todo', lists)).toBe('backlog-list-id')
    })

    it('returns the list for "done" status', () => {
      expect(listForStatus('done', lists)).toBe('done-list-id')
    })

    it('returns the list for "doing" status', () => {
      expect(listForStatus('doing', lists)).toBe('doing-list-id')
    })

    it('returns null when no list maps to the status', () => {
      expect(listForStatus('done', [])).toBe(null)
    })

    it('does not mutate the input array', () => {
      const originalOrder = lists.map((l) => l.id)
      listForStatus('todo', lists)
      const afterOrder = lists.map((l) => l.id)
      expect(afterOrder).toEqual(originalOrder)
    })
  })

  describe('reconcile', () => {
    it('list wins: returns mapsToStatus of listId when it exists', () => {
      const result = reconcile({ status: 'todo', listId: 'done-list-id' }, lists)
      expect(result).toEqual({ status: 'done', listId: 'done-list-id' })
    })

    it('status wins: refills listId when it is null', () => {
      const result = reconcile({ status: 'done', listId: null }, lists)
      expect(result).toEqual({ status: 'done', listId: 'done-list-id' })
    })

    it('status wins: refills listId when it refers to a deleted list', () => {
      const result = reconcile({ status: 'done', listId: 'deleted-id' }, lists)
      expect(result).toEqual({ status: 'done', listId: 'done-list-id' })
    })

    it('status and listId both sync when listId is invalid', () => {
      const result = reconcile({ status: 'doing', listId: 'nonexistent' }, lists)
      expect(result).toEqual({ status: 'doing', listId: 'doing-list-id' })
    })

    it('status does not change when listId is valid', () => {
      const result = reconcile({ status: 'todo', listId: 'doing-list-id' }, lists)
      expect(result).toEqual({ status: 'doing', listId: 'doing-list-id' })
    })
  })
})
