import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '@/shared/types/productivity'

const updateTask = vi.fn()
vi.mock('@/shared/repositories', () => ({
  repositories: { tasks: { update: (...a: unknown[]) => updateTask(...a) } },
}))

const { addDependency } = await import('./AddDependency.usecase')

const task = (id: string, dependsOn: string[] = [], title = id): Task =>
  ({ id, title, dependsOn, status: 'todo' }) as Task

beforeEach(() => {
  updateTask.mockReset().mockResolvedValue(undefined)
})

describe('addDependency', () => {
  it('throws with the offending chain in the message when the edge would cycle', async () => {
    // A dep B, B dep C; adding "C dep A" closes the loop.
    const all = [task('A', ['B'], 'Alpha'), task('B', ['C'], 'Beta'), task('C', [], 'Gamma')]

    await expect(addDependency('u1', all[2], 'A', all)).rejects.toThrow(
      /lingkaran: Gamma → Alpha → Beta → Gamma/,
    )
    expect(updateTask).not.toHaveBeenCalled()
  })

  it('writes the appended dependsOn array for a safe add', async () => {
    const all = [task('A', ['B']), task('B'), task('C')]

    await addDependency('u1', all[0], 'C', all)

    expect(updateTask).toHaveBeenCalledWith('u1', 'A', { dependsOn: ['B', 'C'] })
  })

  it('is a silent no-op when the blocker is already present', async () => {
    const all = [task('A', ['B']), task('B')]
    await addDependency('u1', all[0], 'B', all)
    expect(updateTask).not.toHaveBeenCalled()
  })
})
