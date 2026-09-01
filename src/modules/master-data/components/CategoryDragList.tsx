'use client'

import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { cn } from '@/shared/lib/utils'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { PILLAR_LABELS, type Category, type Pillar } from '@/shared/types/domain'
import { CATEGORY_ICONS } from './CategoryForm'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'

function SortableCategoryRow({
  category,
  itemCount,
  income,
  onEdit,
  onDelete,
}: {
  category: Category
  itemCount: number
  income: number
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })

  const Icon = CATEGORY_ICONS[category.icon] ?? CATEGORY_ICONS['shopping-cart']

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border bg-card p-3',
        isDragging && 'z-10 shadow-lg',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Ubah urutan ${category.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: category.color }}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium leading-tight">{category.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatPercent(category.percentOfIncome, 1)}
          {income > 0 && ` · ${formatIDR((income * category.percentOfIncome) / 100)}`}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {category.isSinkingFund && <Badge variant="secondary">Sinking</Badge>}
        {itemCount > 0 && <Badge variant="outline">{itemCount} item</Badge>}
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onEdit(category)}
          aria-label={`Ubah ${category.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          onClick={() => onDelete(category)}
          aria-label={`Hapus ${category.name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}

/**
 * One sortable list per pillar. Dragging is scoped within a pillar — moving a category
 * to another pillar is an edit, not a reorder, because it changes what the money means.
 */
export function CategoryDragList({
  pillar,
  onEdit,
}: {
  pillar: Exclude<Pillar, 'income'>
  onEdit: (category: Category) => void
}) {
  const categories = useMasterDataStore((s) => s.categories)
  const categoryItems = useMasterDataStore((s) => s.categoryItems)
  const reorder = useMasterDataStore((s) => s.reorder)
  const summary = useBudgetStore((s) => s.summary)
  const monthlyBudget = useBudgetStore((s) => s.monthlyBudget)

  const [deleting, setDeleting] = useState<Category | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const inPillar = categories
    .filter((c) => c.isActive && c.pillar === pillar)
    .sort((a, b) => a.order - b.order)

  const income = summary?.totalIncome ?? 0
  const allocated = inPillar.reduce((sum, c) => sum + c.percentOfIncome, 0)
  const ceiling = (monthlyBudget?.pillarConfig?.[pillar] ?? 0) * 100
  const overAllocated = ceiling > 0 && allocated > ceiling + 0.05
  const gap = ceiling > 0 && allocated < ceiling - 0.05

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = inPillar.findIndex((c) => c.id === active.id)
    const newIndex = inPillar.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const ordered = arrayMove(inPillar, oldIndex, newIndex).map((c) => c.id)
    void reorder(pillar, ordered).catch(() => toast.error('Gagal menyimpan urutan'))
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1 space-y-0 pb-3">
        <CardTitle className="flex shrink-0 items-center gap-2 text-base">
          <PillarColorDot pillar={pillar} />
          {PILLAR_LABELS[pillar]}
        </CardTitle>
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {formatPercent(allocated, 1)}
          {ceiling > 0 && ` / ${formatPercent(ceiling, 1)}`}
        </span>
      </CardHeader>

      <CardContent className="space-y-3">
        {inPillar.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Belum ada kategori aktif di pilar ini. Minimal satu kategori disarankan.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={inPillar.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="min-w-0 space-y-2">
                {inPillar.map((category) => (
                  <SortableCategoryRow
                    key={category.id}
                    category={category}
                    itemCount={(categoryItems[category.id] ?? []).length}
                    income={income}
                    onEdit={onEdit}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {overAllocated && (
          <p className="flex items-start gap-1.5 text-xs text-exceeded">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Kategori di pilar ini menjumlah {formatPercent(allocated, 1)}, melebihi jatah pilar{' '}
            {formatPercent(ceiling, 1)}.
          </p>
        )}

        {gap && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Masih ada {formatPercent(ceiling - allocated, 1)} yang belum dialokasikan di pilar ini.
          </p>
        )}
      </CardContent>

      <DeleteCategoryDialog
        category={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </Card>
  )
}
