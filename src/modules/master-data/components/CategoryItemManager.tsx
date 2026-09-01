'use client'

import { useState } from 'react'
import { CalendarClock, Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Switch } from '@/shared/components/ui/switch'
import { EmptyState } from '@/shared/components/finance/EmptyState'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { formatIDR } from '@/shared/lib/format'
import {
  createCategoryItem,
  deleteCategoryItem,
  updateCategoryItem,
} from '@/shared/use-cases/master-data/CategoryItems.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import type { CategoryItem } from '@/shared/types/domain'

function ItemForm({
  categoryId,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  categoryId: string
  item: CategoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)

  const [name, setName] = useState(item?.name ?? '')
  const [isRecurring, setIsRecurring] = useState(item?.isRecurring ?? false)
  const [amount, setAmount] = useState(item?.recurringAmount ?? 0)
  const [day, setDay] = useState(item?.recurringDay ?? 1)
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) return

    setSaving(true)
    try {
      const payload = {
        categoryId,
        name,
        isRecurring,
        recurringAmount: isRecurring ? amount : undefined,
        recurringDay: isRecurring ? day : undefined,
      }

      if (item) await updateCategoryItem(userId, item.id, payload)
      else await createCategoryItem(userId, payload)

      toast.success(item ? 'Item diperbarui' : 'Item ditambahkan')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Ubah item' : 'Item baru'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item-name" className="text-xs">
              Nama item
            </Label>
            <Input
              id="item-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Netflix"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium">Tagihan tetap</p>
              <p className="text-xs text-muted-foreground">Nominal sama tiap bulan.</p>
            </div>
            <Switch
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
              aria-label="Tagihan tetap"
            />
          </div>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-amount" className="text-xs">
                  Nominal
                </Label>
                <MoneyInput id="item-amount" value={amount} onChange={setAmount} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-day" className="text-xs">
                  Tanggal jatuh tempo
                </Label>
                <Input
                  id="item-day"
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  onChange={(event) => setDay(Number(event.target.value))}
                />
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Sub-items per category — the third level of the transaction cascader. */
export function CategoryItemManager() {
  const userId = useAuthStore((s) => s.user?.uid)
  const categories = useMasterDataStore((s) => s.categories)
  const categoryItems = useMasterDataStore((s) => s.categoryItems)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [formOpen, setFormOpen] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [editing, setEditing] = useState<CategoryItem | null>(null)

  const active = categories.filter((c) => c.isActive && c.pillar !== 'income')

  const remove = async (item: CategoryItem) => {
    if (!userId) return
    try {
      await deleteCategoryItem(userId, item.id)
      await loadAll()
      toast.success('Item dihapus')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus item')
    }
  }

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Belum ada kategori"
        description="Tambahkan kategori dulu sebelum mengelola item di dalamnya."
      />
    )
  }

  return (
    <div className="space-y-3">
      {active.map((category) => {
        const items = categoryItems[category.id] ?? []
        return (
          <Card key={category.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="truncate">{category.name}</span>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  setActiveCategoryId(category.id)
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                Item
              </Button>
            </CardHeader>

            <CardContent>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada item.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.name}</p>
                        {item.isRecurring && item.recurringAmount ? (
                          <p className="text-xs text-muted-foreground">
                            {formatIDR(item.recurringAmount)}
                            {item.recurringDay ? ` · tiap tanggal ${item.recurringDay}` : ''}
                          </p>
                        ) : null}
                      </div>

                      {item.isRecurring && (
                        <Badge variant="secondary" className="shrink-0 gap-1">
                          <CalendarClock className="size-3" aria-hidden />
                          Rutin
                        </Badge>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setActiveCategoryId(category.id)
                          setEditing(item)
                          setFormOpen(true)
                        }}
                        aria-label={`Ubah ${item.name}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => void remove(item)}
                        aria-label={`Hapus ${item.name}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}

      {formOpen && (
        <ItemForm
          categoryId={activeCategoryId}
          item={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={() => void loadAll()}
        />
      )}
    </div>
  )
}
