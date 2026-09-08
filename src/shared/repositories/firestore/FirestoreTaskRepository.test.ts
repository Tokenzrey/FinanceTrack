import { describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { DocumentSnapshot } from 'firebase/firestore'
import type { ChecklistItem } from '@/shared/types/board'

// `paths.ts` reaches for the Firestore app at import time.
vi.mock('@/shared/lib/firebase', () => ({ getDb: () => ({}) }))

const { toTask } = await import('./FirestoreTaskRepository')

const snap = (data: Record<string, unknown>) =>
  ({ id: 't1', data: () => data }) as unknown as DocumentSnapshot

describe('toTask', () => {
  it('keeps the board fields written by the board use-cases', () => {
    const startAt = Timestamp.fromDate(new Date('2026-09-08T00:00:00Z'))
    const checklist: ChecklistItem[] = [{ id: 'x', title: 'a', done: false, order: 1000 }]

    const task = toTask(
      snap({
        title: 'Tinjau PRD',
        status: 'doing',
        listId: 'c2',
        order: 1500,
        checklist,
        startAt,
        labelIds: ['l1'],
        dependsOn: ['t9'],
        storyPoints: 3,
        coverColor: 'teal',
      }),
    )

    expect(task).toMatchObject({
      id: 't1',
      title: 'Tinjau PRD',
      status: 'doing',
      listId: 'c2',
      order: 1500,
      checklist,
      startAt,
      labelIds: ['l1'],
      dependsOn: ['t9'],
      storyPoints: 3,
      coverColor: 'teal',
    })
  })

  it('falls back to safe defaults for a bot-created doc with no board fields', () => {
    const task = toTask(snap({ title: 'Beli susu', source: 'whatsapp' }))

    expect(task).toMatchObject({
      listId: null,
      order: 0,
      startAt: null,
      labelIds: [],
      storyPoints: null,
      dependsOn: [],
      checklist: [],
      attachments: [],
      progressNotes: [],
      coverColor: null,
    })
  })
})
