'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useRecurringStore } from '@/shared/stores/recurring.store'
import {
  PILLAR_LABELS,
  type Pillar,
  type RecurringFrequency,
  type RecurringRule,
} from '@/shared/types/domain'
import { PaymentMethodSelect } from '@/modules/transactions/components/FormFields'
import type { PaymentMethod } from '@/shared/types/domain'

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly', label: 'Tahunan' },
]

const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function FormBody({ rule, onDone }: { rule?: RecurringRule | null; onDone: () => void }) {
  const categories = useMasterDataStore((s) => s.categories)
  const create = useRecurringStore((s) => s.create)
  const update = useRecurringStore((s) => s.update)

  const [name, setName] = useState(rule?.name ?? '')
  const [amount, setAmount] = useState(rule?.amount ?? 0)
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ?? 1)
  const [dayOfWeek, setDayOfWeek] = useState(rule?.dayOfWeek ?? 1)
  const [startDate, setStartDate] = useState(
    toDateInput(rule?.startDate ? rule.startDate.toDate() : new Date()),
  )
  const [endDate, setEndDate] = useState(rule?.endDate ? toDateInput(rule.endDate.toDate()) : '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(rule?.paymentMethod ?? '')
  const [saving, setSaving] = useState(false)

  const active = categories.filter((c) => c.isActive && c.pillar !== 'income')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!name.trim()) return toast.error('Nama aturan wajib diisi')
    if (amount <= 0) return toast.error('Jumlah harus lebih dari nol')
    if (!categoryId) return toast.error('Pilih kategori dulu')

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        type: 'expense' as const,
        categoryId,
        amount,
        frequency,
        // Only the field the chosen frequency actually uses is sent.
        dayOfMonth: frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : undefined,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        startDate: new Date(`${startDate}T12:00:00`),
        endDate: endDate ? new Date(`${endDate}T12:00:00`) : undefined,
        paymentMethod: paymentMethod || undefined,
      }

      if (rule) {
        await update(rule.id, payload)
        toast.success('Aturan diperbarui')
      } else {
        await create(payload)
        toast.success('Aturan berulang dibuat')
      }
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan aturan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rec-name" className="text-xs">
          Nama
        </Label>
        <Input
          id="rec-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Langganan Netflix"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-amount" className="text-xs">
            Jumlah
          </Label>
          <MoneyInput id="rec-amount" value={amount} onChange={setAmount} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-category" className="text-xs">
            Kategori
          </Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="rec-category">
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-frequency" className="text-xs">
            Frekuensi
          </Label>
          <Select
            value={frequency}
            onValueChange={(value) => setFrequency(value as RecurringFrequency)}
          >
            <SelectTrigger id="rec-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(frequency === 'monthly' || frequency === 'yearly') && (
          <div className="space-y-1.5">
            <Label htmlFor="rec-day" className="text-xs">
              Tanggal jatuh tempo
            </Label>
            <Input
              id="rec-day"
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(event) => setDayOfMonth(Number(event.target.value))}
            />
            {dayOfMonth > 28 && (
              <p className="text-xs text-muted-foreground">
                Di bulan yang lebih pendek, jatuh tempo mundur ke tanggal terakhir.
              </p>
            )}
          </div>
        )}

        {frequency === 'weekly' && (
          <div className="space-y-1.5">
            <Label htmlFor="rec-weekday" className="text-xs">
              Hari
            </Label>
            <Select
              value={String(dayOfWeek)}
              onValueChange={(value) => setDayOfWeek(Number(value))}
            >
              <SelectTrigger id="rec-weekday">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((label, index) => (
                  <SelectItem key={label} value={String(index)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-start" className="text-xs">
            Mulai
          </Label>
          <Input
            id="rec-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-end" className="text-xs">
            Berakhir <span className="text-muted-foreground">(opsional)</span>
          </Label>
          <Input
            id="rec-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />

      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
        {rule ? 'Simpan perubahan' : 'Buat aturan'}
      </Button>
    </form>
  )
}

export function RecurringForm({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: RecurringRule | null
}) {
  const isDesktop = useIsDesktop()
  const title = rule ? 'Ubah aturan berulang' : 'Aturan berulang baru'
  const description = 'Tagihan, langganan, atau cicilan yang berulang tiap periode.'
  const body = open ? <FormBody rule={rule} onDone={() => onOpenChange(false)} /> : null

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}
