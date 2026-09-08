'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { cn } from '@/shared/lib/utils'
import { usePlannerStore } from '@/shared/stores/planner.store'
import type { BoardFilters, BoardList, Label } from '@/shared/types/board'
import type { Task, TaskPriority } from '@/shared/types/productivity'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Rendah',
  med: 'Sedang',
  high: 'Tinggi',
}

// ─── Pure helpers (used by BoardView / Timeline) ───

/** Filter `tasks` by the active board filters. An empty filter passes everything.
 *  Search matches the task title only. */
export function applyBoardFilters(tasks: Task[], filters: BoardFilters): Task[] {
  const search = filters.search.trim().toLowerCase()
  return tasks.filter((task) => {
    if (filters.labelIds.length > 0) {
      const ids = task.labelIds ?? []
      if (!filters.labelIds.some((id) => ids.includes(id))) return false
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
    if (filters.listIds.length > 0) {
      if (!task.listId || !filters.listIds.includes(task.listId)) return false
    }
    if (filters.hasDue !== null && Boolean(task.dueAt) !== filters.hasDue) return false
    if (search && !task.title.toLowerCase().includes(search)) return false
    return true
  })
}

/** Human-readable labels for every active filter — used by the filtered empty state. */
export function describeActiveFilters(
  filters: BoardFilters,
  lists: BoardList[],
  labels: Label[],
): string[] {
  const out: string[] = []
  for (const id of filters.labelIds) {
    const label = labels.find((l) => l.id === id)
    if (label) out.push(label.name)
  }
  for (const p of filters.priorities) out.push(`Prioritas: ${PRIORITY_LABELS[p]}`)
  for (const id of filters.listIds) {
    const list = lists.find((l) => l.id === id)
    if (list) out.push(`Kolom: ${list.title}`)
  }
  if (filters.hasDue === true) out.push('Punya jatuh tempo')
  if (filters.hasDue === false) out.push('Tanpa jatuh tempo')
  if (filters.search.trim()) out.push(`Pencarian: "${filters.search.trim()}"`)
  return out
}

function isActive(filters: BoardFilters): boolean {
  return (
    filters.labelIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.listIds.length > 0 ||
    filters.hasDue !== null ||
    filters.search.trim().length > 0
  )
}

// ─── Sub-components ───

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  selected: T[]
  onChange: (next: T[]) => void
}) {
  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-primary px-1 text-xs text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Tidak ada pilihan</p>
        ) : (
          options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span
                className={cn(
                  'grid h-4 w-4 shrink-0 place-content-center rounded-sm border',
                  selected.includes(opt.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input',
                )}
              >
                {selected.includes(opt.value) && <Check className="h-3 w-3" aria-hidden />}
              </span>
              {opt.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}

function Chip({ children, onRemove }: { children: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Buang filter ${children}`}
        className="rounded-full p-0.5 hover:bg-background"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )
}

// ─── FilterBar ───

/** Board/timeline filter controls + removable active-filter chips. Reads and
 *  writes the planner store's `filters` slice. */
export function FilterBar() {
  const filters = usePlannerStore((s) => s.filters)
  const setFilters = usePlannerStore((s) => s.setFilters)
  const clearFilters = usePlannerStore((s) => s.clearFilters)
  const lists = usePlannerStore((s) => s.lists)
  const labels = usePlannerStore((s) => s.labels)

  // Debounced search — local input state, pushed to the store ~250ms after typing stops.
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => setSearchDraft(filters.search), [filters.search])
  const onSearch = (value: string) => {
    setSearchDraft(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setFilters({ search: value }), 250)
  }
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const hasDueLabel =
    filters.hasDue === true ? 'Punya jatuh tempo' : filters.hasDue === false ? 'Tanpa jatuh tempo' : 'Jatuh tempo: semua'
  const cycleHasDue = () =>
    setFilters({ hasDue: filters.hasDue === null ? true : filters.hasDue === true ? false : null })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchDraft}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cari tugas…"
          className="h-9 w-48"
        />

        <MultiSelect
          label="Label"
          options={labels.map((l) => ({ value: l.id, label: l.name }))}
          selected={filters.labelIds}
          onChange={(labelIds) => setFilters({ labelIds })}
        />
        <MultiSelect<TaskPriority>
          label="Prioritas"
          options={(['low', 'med', 'high'] as TaskPriority[]).map((p) => ({
            value: p,
            label: PRIORITY_LABELS[p],
          }))}
          selected={filters.priorities}
          onChange={(priorities) => setFilters({ priorities })}
        />
        <MultiSelect
          label="Kolom"
          options={lists.map((l) => ({ value: l.id, label: l.title }))}
          selected={filters.listIds}
          onChange={(listIds) => setFilters({ listIds })}
        />

        <Button variant="outline" size="sm" onClick={cycleHasDue}>
          {hasDueLabel}
        </Button>
      </div>

      {isActive(filters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.labelIds.map((id) => {
            const label = labels.find((l) => l.id === id)
            return label ? (
              <Chip
                key={`label-${id}`}
                onRemove={() => setFilters({ labelIds: filters.labelIds.filter((x) => x !== id) })}
              >
                {label.name}
              </Chip>
            ) : null
          })}
          {filters.priorities.map((p) => (
            <Chip
              key={`prio-${p}`}
              onRemove={() => setFilters({ priorities: filters.priorities.filter((x) => x !== p) })}
            >
              {`Prioritas: ${PRIORITY_LABELS[p]}`}
            </Chip>
          ))}
          {filters.listIds.map((id) => {
            const list = lists.find((l) => l.id === id)
            return list ? (
              <Chip
                key={`list-${id}`}
                onRemove={() => setFilters({ listIds: filters.listIds.filter((x) => x !== id) })}
              >
                {`Kolom: ${list.title}`}
              </Chip>
            ) : null
          })}
          {filters.hasDue !== null && (
            <Chip onRemove={() => setFilters({ hasDue: null })}>
              {filters.hasDue ? 'Punya jatuh tempo' : 'Tanpa jatuh tempo'}
            </Chip>
          )}
          {filters.search.trim() && (
            <Chip onRemove={() => setFilters({ search: '' })}>
              {`Pencarian: "${filters.search.trim()}"`}
            </Chip>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>
            Hapus semua
          </Button>
        </div>
      )}
    </div>
  )
}
