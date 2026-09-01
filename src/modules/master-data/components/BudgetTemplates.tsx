'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { EmptyState } from '@/shared/components/finance/EmptyState'
import { formatPercent } from '@/shared/lib/format'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { CHART_COLORS } from '@/shared/components/charts/chart-theme'
import { PILLAR_LABELS, type BudgetTemplate } from '@/shared/types/domain'

/** Mini stacked bar previewing a template's pillar split. */
function TemplatePreview({ template }: { template: BudgetTemplate }) {
  const { needs, wants, savings } = template.pillarConfig
  const segments = [
    { key: 'needs' as const, value: needs },
    { key: 'wants' as const, value: wants },
    { key: 'savings' as const, value: savings },
  ]

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{
              width: `${segment.value * 100}%`,
              backgroundColor: CHART_COLORS.light[segment.key],
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {segments.map((s) => `${PILLAR_LABELS[s.key]} ${formatPercent(s.value * 100)}`).join(' · ')}
      </p>
    </div>
  )
}

export function BudgetTemplates() {
  const userId = useAuthStore((s) => s.user?.uid)
  const monthlyBudget = useBudgetStore((s) => s.monthlyBudget)
  const updatePillarConfig = useBudgetStore((s) => s.updatePillarConfig)
  const categories = useMasterDataStore((s) => s.categories)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [templates, setTemplates] = useState<BudgetTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [applying, setApplying] = useState<BudgetTemplate | null>(null)

  const load = async () => {
    if (!userId) return
    setLoading(true)
    try {
      setTemplates(await repositories.templates.findAll(userId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const saveCurrent = async () => {
    if (!userId || !monthlyBudget) return
    try {
      await repositories.templates.create(userId, {
        name: name.trim() || 'Template tanpa nama',
        pillarConfig: monthlyBudget.pillarConfig,
        categoryAllocations: categories
          .filter((c) => c.isActive && c.pillar !== 'income')
          .map((c) => ({ categoryId: c.id, percent: c.percentOfIncome })),
        isDefault: false,
      })
      toast.success('Template disimpan')
      setName('')
      setSaveOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan template')
    }
  }

  /**
   * Applying a template rewrites the pillar split and each category's percentage.
   * Categories added since the template was saved keep their current percentage —
   * a template should not silently zero out something it has never heard of.
   */
  const apply = async (template: BudgetTemplate) => {
    if (!userId) return
    try {
      await updatePillarConfig(template.pillarConfig)

      for (const allocation of template.categoryAllocations) {
        const exists = categories.find((c) => c.id === allocation.categoryId && c.isActive)
        if (!exists) continue
        await repositories.categories.update(userId, allocation.categoryId, {
          percentOfIncome: allocation.percent,
        })
      }

      await loadAll()
      toast.success(`Template "${template.name}" diterapkan`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menerapkan template')
    } finally {
      setApplying(null)
    }
  }

  const remove = async (template: BudgetTemplate) => {
    if (!userId) return
    await repositories.templates.delete(userId, template.id)
    await load()
    toast.success('Template dihapus')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setSaveOpen(true)} disabled={!monthlyBudget} className="gap-2">
          <Plus className="size-4" aria-hidden />
          Simpan anggaran saat ini
        </Button>
      </div>

      {loading && templates.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Memuat template…</CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Belum ada template"
          description="Simpan komposisi anggaran yang kamu suka, lalu terapkan lagi di bulan berikutnya."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Card className="h-full">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{template.name}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => void remove(template)}
                      aria-label={`Hapus template ${template.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <TemplatePreview template={template} />

                  <p className="text-xs text-muted-foreground">
                    {template.categoryAllocations.length} kategori
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setApplying(template)}
                  >
                    Terapkan
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Simpan sebagai template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="text-xs">
                Nama template
              </Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Bulan hemat"
                autoFocus
              />
            </div>
            <Button onClick={() => void saveCurrent()} className="w-full">
              Simpan template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(applying)} onOpenChange={() => setApplying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terapkan &ldquo;{applying?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Komposisi pilar dan persentase kategori bulan ini akan ditimpa. Transaksi yang sudah
              tercatat tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => applying && void apply(applying)}>
              Terapkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
