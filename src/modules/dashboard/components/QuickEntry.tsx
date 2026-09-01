'use client'

import { useState } from 'react'
import { Loader2, Plus, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/shared/components/ui/drawer'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { hapticSuccess } from '@/shared/lib/haptics'
import { PILLAR_LABELS, type Pillar } from '@/shared/types/domain'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useTransactionStore } from '@/shared/stores/transaction.store'
import { ScanDialog } from '@/modules/receipt-scanner/ScanDialog'

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

/** Shared form body. The desktop bar and the mobile drawer render the same fields. */
function QuickEntryForm({ onDone }: { onDone?: () => void }) {
  const categories = useMasterDataStore((s) => s.categories)
  const add = useTransactionStore((s) => s.add)

  const [amount, setAmount] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const active = categories.filter((c) => c.isActive && c.pillar !== 'income')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!categoryId) {
      toast.error('Pilih kategori dulu')
      return
    }

    const category = active.find((c) => c.id === categoryId)
    if (!category) return

    setSaving(true)
    try {
      await add({
        date: new Date(),
        type: 'expense',
        pillar: category.pillar,
        categoryId,
        amount,
        description: description.trim() || undefined,
        tags: [],
      })
      toast.success('Transaksi tersimpan')
      hapticSuccess()
      setAmount(0)
      setDescription('')
      onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan transaksi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
    >
      <div className="space-y-1.5">
        <Label htmlFor="quick-amount" className="text-xs">
          Jumlah
        </Label>
        <MoneyInput id="quick-amount" value={amount} onChange={setAmount} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-category" className="text-xs">
          Kategori
        </Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="quick-category">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>
            {SPEND_PILLARS.map((pillar) => {
              const group = active.filter((c) => c.pillar === pillar)
              if (group.length === 0) return null
              return (
                <div key={pillar}>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {PILLAR_LABELS[pillar]}
                  </p>
                  {group.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </div>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-description" className="text-xs">
          Keterangan
        </Label>
        <Input
          id="quick-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Opsional"
        />
      </div>

      <div className="flex items-end">
        <Button type="submit" disabled={saving || amount <= 0} className="w-full gap-2 sm:w-auto">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Catat
        </Button>
      </div>
    </form>
  )
}

/** Desktop: inline bar at the bottom of the dashboard. */
export function QuickEntryBar() {
  return (
    <Card className="hidden lg:block">
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Catat cepat</p>
        <QuickEntryForm />
      </CardContent>
    </Card>
  )
}

/**
 * Mobile: floating action button. Tapping opens quick entry; the camera button beside
 * it jumps straight into the AI scanner — the plan's "Scan Struk" FAB entry point.
 */
export function QuickEntryFab() {
  const [open, setOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  return (
    <>
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:hidden">
        <Button
          size="icon"
          variant="secondary"
          className="size-11 rounded-2xl shadow-lg"
          onClick={() => setScanOpen(true)}
          aria-label="Scan struk"
        >
          <ScanLine className="size-5" />
        </Button>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button
              size="icon"
              className="size-14 rounded-2xl shadow-lg"
              aria-label="Catat transaksi"
            >
              <Plus className="size-6" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Catat cepat</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-8">
              <QuickEntryForm onDone={() => setOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
    </>
  )
}
