import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RANK_GAP } from '@/shared/lib/rank'
import { EMPTY_BOARD_FILTERS } from '@/shared/types/board'
import type { Label } from '@/shared/types/board'
import type { Task } from '@/shared/types/productivity'

const noop = () => {}
const boardListsWatch = vi.fn(() => noop as () => void)
const labelsWatch = vi.fn(() => noop as () => void)
const tasksWatch = vi.fn(() => noop as () => void)
const remindersWatch = vi.fn(() => noop as () => void)
const labelsCreate = vi.fn(() => Promise.resolve())
const labelsUpdate = vi.fn(() => Promise.resolve())
const labelsRemove = vi.fn(() => Promise.resolve())

vi.mock('@/shared/repositories', () => ({
  repositories: {
    tasks: { watch: tasksWatch },
    reminders: { watch: remindersWatch },
    boardLists: { watch: boardListsWatch },
    labels: {
      watch: labelsWatch,
      create: labelsCreate,
      update: labelsUpdate,
      remove: labelsRemove,
    },
  },
}))

const setDoc = vi.fn(() => Promise.resolve())
const getDoc = vi.fn(() =>
  Promise.resolve({ exists: () => false, data: () => ({}) as Record<string, unknown> }),
)
const doc = vi.fn((...segments: unknown[]) => ({ __ref: segments }))

vi.mock('firebase/firestore', () => ({ doc, setDoc, getDoc }))

vi.mock('@/shared/lib/firebase', () => ({ getDb: () => ({ __db: true }) }))

let currentUid: string | null = 'u1'
vi.mock('./auth.store', () => ({
  useAuthStore: { getState: () => ({ user: currentUid ? { uid: currentUid } : null }) },
}))

const { usePlannerStore } = await import('./planner.store')

const t = (id: string, listId: string | null, order: number | undefined): Task =>
  ({ id, title: id, listId, order }) as unknown as Task

beforeEach(() => {
  vi.clearAllMocks()
  currentUid = 'u1'
  usePlannerStore.setState({
    tasks: [],
    lists: [],
    labels: [],
    activeView: 'board',
    filters: EMPTY_BOARD_FILTERS,
    draggingId: null,
  })
})

describe('tasksInList', () => {
  it('returns only tasks whose listId matches, sorted ascending by order', () => {
    usePlannerStore.setState({
      tasks: [
        t('c', 'L1', 3),
        t('a', 'L1', 1),
        t('other', 'L2', 0),
        t('b', 'L1', 2),
        t('noOrder', 'L1', undefined),
      ],
    })

    const ids = usePlannerStore
      .getState()
      .tasksInList('L1')
      .map((x) => x.id)

    expect(ids).toEqual(['noOrder', 'a', 'b', 'c'])
  })
})

describe('setActiveView', () => {
  it('flips activeView immediately and persists to a boardPrefs doc with merge', () => {
    usePlannerStore.getState().setActiveView('timeline')

    expect(usePlannerStore.getState().activeView).toBe('timeline')
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      'u1',
      'meta',
      'boardPrefs',
    )
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { activeView: 'timeline' }, { merge: true })
  })
})

describe('setFilters / clearFilters', () => {
  it('merges a patch without wiping other keys, and clearFilters resets to empty', () => {
    usePlannerStore.getState().setFilters({ labelIds: ['x'] })
    usePlannerStore.getState().setFilters({ search: 'abc' })

    expect(usePlannerStore.getState().filters).toEqual({
      ...EMPTY_BOARD_FILTERS,
      labelIds: ['x'],
      search: 'abc',
    })

    usePlannerStore.getState().clearFilters()
    expect(usePlannerStore.getState().filters).toEqual(EMPTY_BOARD_FILTERS)
  })
})

describe('label writes', () => {
  const label = (id: string, order: number): Label =>
    ({ id, name: id, colorKey: 'slate', order }) as unknown as Label

  it('trims the name and appends past the highest existing order', async () => {
    usePlannerStore.setState({ labels: [label('a', 1000), label('b', 3000), label('c', 2000)] })

    await usePlannerStore.getState().createLabel('  Urgent  ', 'red')

    expect(labelsCreate).toHaveBeenCalledTimes(1)
    const [uid, data] = labelsCreate.mock.calls[0] as unknown as [string, Label]
    expect(uid).toBe('u1')
    expect(data.name).toBe('Urgent')
    expect(data.colorKey).toBe('red')
    expect(data.order).toBeGreaterThan(3000)
  })

  it('uses the empty-board rank when there are no labels yet', async () => {
    await usePlannerStore.getState().createLabel('Baru', 'teal')

    const [, data] = labelsCreate.mock.calls[0] as unknown as [string, Label]
    expect(data.order).toBe(RANK_GAP)
  })

  it.each([
    ['an empty name', '   '],
    ['a name over 24 chars', 'x'.repeat(25)],
  ])('rejects %s without calling the repository', async (_why, name) => {
    await expect(usePlannerStore.getState().createLabel(name, 'red')).rejects.toThrow(
      'Nama label 1–24 karakter',
    )
    expect(labelsCreate).not.toHaveBeenCalled()
  })

  it('validates the name on update and passes the patch through', async () => {
    await usePlannerStore.getState().updateLabel('l1', { name: '  Penting  ' })
    expect(labelsUpdate).toHaveBeenCalledWith('u1', 'l1', { name: 'Penting' })

    await expect(usePlannerStore.getState().updateLabel('l1', { name: '' })).rejects.toThrow()
  })

  it('recolours without a name in the patch', async () => {
    await usePlannerStore.getState().updateLabel('l1', { colorKey: 'green' })
    expect(labelsUpdate).toHaveBeenCalledWith('u1', 'l1', { colorKey: 'green' })
  })

  it('deletes without cascading to tasks', async () => {
    await usePlannerStore.getState().deleteLabel('l1')
    expect(labelsRemove).toHaveBeenCalledWith('u1', 'l1')
  })
})

describe('subscribeBoardMeta', () => {
  it('returns a no-op and skips the repo watches when signed out', () => {
    currentUid = null

    const unsub = usePlannerStore.getState().subscribeBoardMeta()

    expect(typeof unsub).toBe('function')
    expect(boardListsWatch).not.toHaveBeenCalled()
    expect(labelsWatch).not.toHaveBeenCalled()
    expect(() => unsub()).not.toThrow()
  })

  it('wires both watches and returns an unsubscribe that calls both', () => {
    const listsUnsub = vi.fn()
    const labelsUnsub = vi.fn()
    boardListsWatch.mockReturnValueOnce(listsUnsub)
    labelsWatch.mockReturnValueOnce(labelsUnsub)

    const unsub = usePlannerStore.getState().subscribeBoardMeta()

    expect(boardListsWatch).toHaveBeenCalledWith('u1', expect.any(Function))
    expect(labelsWatch).toHaveBeenCalledWith('u1', expect.any(Function))

    unsub()
    expect(listsUnsub).toHaveBeenCalledTimes(1)
    expect(labelsUnsub).toHaveBeenCalledTimes(1)
  })
})
