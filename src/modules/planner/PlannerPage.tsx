'use client'

import { useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { usePlannerStore } from '@/shared/stores/planner.store'
import { BoardView } from './board/BoardView'
import { QuickAddBar, ListView } from './list/ListView'
import { FilterBar } from './shared/FilterBar'
import { RemindersPanel } from './RemindersPanel'

// Re-exported for `TaskDueDialog.dates.test.ts`, which imports them from this module.
export { toDatetimeLocal, datetimeLocalToUtc } from './list/ListView'

const VIEW_TABS = [
  { value: 'board', label: 'Papan' },
  { value: 'timeline', label: 'Linimasa' },
  { value: 'list', label: 'Daftar' },
] as const

/** Page shell: header + quick-add + reminders are shared by every view; the tab
 *  picks between the Kanban board, the (Task 13) timeline, and the flat list. */
export function PlannerPage() {
  const activeView = usePlannerStore((s) => s.activeView)
  const setActiveView = usePlannerStore((s) => s.setActiveView)

  useEffect(() => {
    const store = usePlannerStore.getState()
    const unsubTasks = store.subscribe()
    const unsubReminders = store.subscribeReminders()
    const unsubBoardMeta = store.subscribeBoardMeta()
    return () => {
      unsubTasks()
      unsubReminders()
      unsubBoardMeta()
    }
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader title="Tugas" description="Daftar tugas dengan pengingat otomatis." />

      <QuickAddBar />

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)}>
        <TabsList>
          {VIEW_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar />

      {activeView === 'board' && <BoardView />}
      {activeView === 'list' && <ListView />}
      {activeView === 'timeline' && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          Linimasa akan segera hadir.
        </p>
      )}

      <RemindersPanel />
    </div>
  )
}
