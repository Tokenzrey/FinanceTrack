import { describe, it, expect } from 'vitest'
import type { Task, TaskStatus } from '@/shared/types/productivity'
import { wouldCreateCycle, readyTasks } from './task-graph'

/** Tiny factory — only the fields task-graph reads. */
const t = (id: string, dependsOn: string[] = [], status: TaskStatus = 'todo'): Task =>
  ({ id, dependsOn, status }) as Task

describe('wouldCreateCycle', () => {
  it('detects A→B→C→A and returns the chain (first === last, contains A,B,C)', () => {
    // A depends on B, B depends on C. Adding "C depends on A" closes the loop.
    const tasks = [t('A', ['B']), t('B', ['C']), t('C')]
    const chain = wouldCreateCycle('C', 'A', tasks)

    expect(chain).not.toBeNull()
    expect(chain![0]).toBe(chain![chain!.length - 1])
    for (const id of ['A', 'B', 'C']) expect(chain).toContain(id)
    // documented order: [fromId, …path from toId…, fromId] → C, A, B, C
    expect(chain).toEqual(['C', 'A', 'B', 'C'])
  })

  it('rejects a 2-node cycle: B depends on A, then adding A depends on B', () => {
    const tasks = [t('A'), t('B', ['A'])]
    const chain = wouldCreateCycle('A', 'B', tasks)

    expect(chain).not.toBeNull()
    expect(chain![0]).toBe(chain![chain!.length - 1])
    expect(chain).toContain('A')
    expect(chain).toContain('B')
    expect(chain).toEqual(['A', 'B', 'A'])
  })

  it('returns null for a safe edge (D depends on A in the A→B→C graph)', () => {
    const tasks = [t('A', ['B']), t('B', ['C']), t('C'), t('D')]
    expect(wouldCreateCycle('D', 'A', tasks)).toBeNull()
  })

  it('treats fromId === toId as a self-cycle', () => {
    expect(wouldCreateCycle('X', 'X', [t('X')])).toEqual(['X', 'X'])
  })

  it('does not hang on a pre-existing malformed cycle in the data', () => {
    // A and B already point at each other (shouldn't happen, but a bad doc could).
    const tasks = [t('A', ['B']), t('B', ['A']), t('C'), t('D')]
    // Unrelated safe edge — must return without spinning.
    expect(wouldCreateCycle('C', 'D', tasks)).toBeNull()
  })

  it('ignores dangling blocker ids (no such task) — cannot form a cycle', () => {
    const tasks = [t('A', ['ghost']), t('B')]
    expect(wouldCreateCycle('B', 'A', tasks)).toBeNull()
  })
})

describe('readyTasks', () => {
  it('a task is not ready while any blocker is unfinished, ready once all are done', () => {
    let tasks = [t('A', ['B', 'C']), t('B', [], 'done'), t('C', [], 'todo')]
    expect(readyTasks(tasks).has('A')).toBe(false)

    tasks = [t('A', ['B', 'C']), t('B', [], 'done'), t('C', [], 'done')]
    expect(readyTasks(tasks).has('A')).toBe(true)
  })

  it('empty dependsOn → ready; missing dependsOn key → ready', () => {
    const withEmpty = t('A', [])
    const noKey = { id: 'B', status: 'todo' } as Task
    const ready = readyTasks([withEmpty, noKey])
    expect(ready.has('A')).toBe(true)
    expect(ready.has('B')).toBe(true)
  })

  it('a dangling blocker (no such task) does not block', () => {
    expect(readyTasks([t('A', ['ghost'])]).has('A')).toBe(true)
  })

  it('the blockers themselves are ready when they have no deps', () => {
    const tasks = [t('A', ['B']), t('B', [], 'todo')]
    const ready = readyTasks(tasks)
    expect(ready.has('B')).toBe(true)
    expect(ready.has('A')).toBe(false)
  })
})
