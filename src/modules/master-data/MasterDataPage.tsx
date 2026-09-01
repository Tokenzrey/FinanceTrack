'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import type { Category, Pillar } from '@/shared/types/domain'
import { BudgetTemplates } from './components/BudgetTemplates'
import { CategoryDragList } from './components/CategoryDragList'
import { CategoryForm } from './components/CategoryForm'
import { CategoryItemManager } from './components/CategoryItemManager'
import { PillarConfigPanel } from './components/PillarConfigPanel'

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

export function MasterDataPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const loadSummary = useBudgetStore((s) => s.loadSummary)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void loadSummary()
  }, [userId, year, month, loadAll, loadSummary])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Master data"
        description="Atur pilar, kategori, item, dan template anggaran."
        actions={<PeriodSelector />}
      />

      <Tabs defaultValue="categories">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pillars">Pilar</TabsTrigger>
          <TabsTrigger value="categories">Kategori</TabsTrigger>
          <TabsTrigger value="items">Item</TabsTrigger>
          <TabsTrigger value="templates">Template</TabsTrigger>
        </TabsList>

        <TabsContent value="pillars" className="mt-4">
          <PillarConfigPanel />
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden />
              Kategori baru
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {SPEND_PILLARS.map((pillar) => (
              <CategoryDragList
                key={pillar}
                pillar={pillar}
                onEdit={(category) => {
                  setEditing(category)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <CategoryItemManager />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <BudgetTemplates />
        </TabsContent>
      </Tabs>

      <CategoryForm open={formOpen} onOpenChange={setFormOpen} category={editing} />
    </div>
  )
}
