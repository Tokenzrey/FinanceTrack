'use client'

import { useCallback, useEffect, useMemo } from 'react'

/**
 * A small LIFO of inverse actions, plus the Ctrl/Cmd+Z binding that drains it.
 *
 * Scope is deliberately narrow: data mutations the user performs by direct
 * manipulation (moving a card, reordering a column, dragging a bar). Text edits
 * inside inputs keep the browser's own per-field history, which is why the key
 * handler bails when a field has focus.
 */

/** Entries kept before the oldest is forgotten. */
export const UNDO_LIMIT = 10

export interface UndoEntry {
  /** Human label for the toast — "pindah kartu", "urutkan kolom". */
  label: string
  undo: () => void | Promise<void>
}

export interface UndoStack {
  push: (entry: UndoEntry) => void
  /** Runs the newest entry and returns its label, or `null` if there was none. */
  undo: () => Promise<string | null>
  clear: () => void
  size: () => number
}

export function createUndoStack(): UndoStack {
  const entries: UndoEntry[] = []

  return {
    push(entry) {
      entries.push(entry)
      if (entries.length > UNDO_LIMIT) entries.shift()
    },
    async undo() {
      const entry = entries.pop()
      if (!entry) return null
      // Popped before awaiting: a failed inverse must not stay at the top of the
      // stack, or Ctrl+Z would retry it forever and never reach the entry below.
      await entry.undo()
      return entry.label
    },
    clear() {
      entries.length = 0
    },
    size() {
      return entries.length
    },
  }
}

/** True when the event came from somewhere the browser's own undo should win. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

/**
 * Binds Ctrl/Cmd+Z to a stack for as long as the component is mounted.
 * `onUndone` receives the label of whatever was reverted, for a toast.
 */
export function useUndoStack(onUndone: (label: string) => void): UndoStack {
  const stack = useMemo(() => createUndoStack(), [])

  const onUndoneRef = useCallback(onUndone, [onUndone])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const combo = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
      if (!combo || e.key.toLowerCase() !== 'z') return
      if (isTextEntry(e.target)) return
      if (stack.size() === 0) return

      e.preventDefault()
      void stack.undo().then((label) => {
        if (label) onUndoneRef(label)
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stack, onUndoneRef])

  return stack
}
