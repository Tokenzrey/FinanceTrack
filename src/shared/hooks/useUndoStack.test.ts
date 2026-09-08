import { describe, expect, it, vi } from 'vitest'

import { UNDO_LIMIT, createUndoStack } from './useUndoStack'

describe('createUndoStack', () => {
  it('runs the most recent undo first and drops it from the stack', async () => {
    const stack = createUndoStack()
    const first = vi.fn()
    const second = vi.fn()
    stack.push({ label: 'pindah kartu', undo: first })
    stack.push({ label: 'urutkan kolom', undo: second })

    expect(await stack.undo()).toBe('urutkan kolom')
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()

    expect(await stack.undo()).toBe('pindah kartu')
    expect(first).toHaveBeenCalledOnce()
  })

  it('reports nothing to undo on an empty stack instead of throwing', async () => {
    expect(await createUndoStack().undo()).toBeNull()
  })

  it('forgets the oldest entry past the limit so long sessions stay bounded', async () => {
    const stack = createUndoStack()
    const oldest = vi.fn()
    stack.push({ label: 'oldest', undo: oldest })
    for (let i = 0; i < UNDO_LIMIT; i++) {
      stack.push({ label: `later ${i}`, undo: vi.fn() })
    }
    expect(stack.size()).toBe(UNDO_LIMIT)

    for (let i = 0; i < UNDO_LIMIT; i++) await stack.undo()
    expect(oldest).not.toHaveBeenCalled()
    expect(await stack.undo()).toBeNull()
  })

  it('drops the entry even when its undo rejects, so a bad entry cannot wedge the stack', async () => {
    const stack = createUndoStack()
    stack.push({ label: 'boom', undo: () => Promise.reject(new Error('write failed')) })
    await expect(stack.undo()).rejects.toThrow('write failed')
    expect(stack.size()).toBe(0)
  })

  it('clears everything on demand', async () => {
    const stack = createUndoStack()
    stack.push({ label: 'a', undo: vi.fn() })
    stack.clear()
    expect(stack.size()).toBe(0)
    expect(await stack.undo()).toBeNull()
  })
})
