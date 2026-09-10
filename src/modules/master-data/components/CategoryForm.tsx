'use client'

import { useState } from 'react'
import {
  BookOpen,
  Camera,
  Car,
  Coffee,
  DollarSign,
  Dumbbell,
  Gamepad2,
  Gift,
  Globe,
  Heart,
  Home,
  Laptop,
  Loader2,
  Music,
  Plane,
  ShieldCheck,
  ShoppingCart,
  Star,
  TrendingUp,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { ModalFormShell } from '@/shared/components/ui/modal-form-shell'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Switch } from '@/shared/components/ui/switch'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { PercentInput } from '@/shared/components/finance/PercentInput'
import { cn } from '@/shared/lib/utils'
import { formatIDR } from '@/shared/lib/format'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { PILLAR_LABELS, type Category, type CategoryIcon, type Pillar } from '@/shared/types/domain'

export const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  home: Home,
  zap: Zap,
  'shopping-cart': ShoppingCart,
  car: Car,
  heart: Heart,
  coffee: Coffee,
  gamepad: Gamepad2,
  book: BookOpen,
  'trending-up': TrendingUp,
  shield: ShieldCheck,
  globe: Globe,
  music: Music,
  camera: Camera,
  dumbbell: Dumbbell,
  gift: Gift,
  laptop: Laptop,
  plane: Plane,
  utensils: Utensils,
  'dollar-sign': DollarSign,
  star: Star,
}

const PRESET_COLORS = [
  '#14B8A6',
  '#0D9488',
  '#0F766E',
  '#115E59',
  '#F97316',
  '#EA580C',
  '#C2410C',
  '#9A3412',
  '#8B5CF6',
  '#7C3AED',
  '#6D28D9',
  '#5B21B6',
  '#F59E0B',
  '#EF4444',
  '#22C55E',
  '#0EA5E9',
]

const SPEND_PILLARS: Exclude<Pillar, 'income'>[] = ['needs', 'wants', 'savings']

const FORM_ID = 'category-form'

function FormBody({
  category,
  onDone,
  onSavingChange,
}: {
  category?: Category | null
  onDone: () => void
  onSavingChange: (saving: boolean) => void
}) {
  const addCategory = useMasterDataStore((s) => s.addCategory)
  const updateCategory = useMasterDataStore((s) => s.updateCategory)
  const summary = useBudgetStore((s) => s.summary)

  const [name, setName] = useState(category?.name ?? '')
  const [pillar, setPillar] = useState<Pillar>(category?.pillar ?? 'needs')
  const [percent, setPercent] = useState(category?.percentOfIncome ?? 5)
  const [budgetMode, setBudgetMode] = useState<'percent' | 'fixed'>(category?.budgetMode ?? 'percent')
  const [fixedBudget, setFixedBudget] = useState(category?.fixedMonthlyBudget ?? 0)
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[0])
  const [icon, setIcon] = useState<CategoryIcon>(category?.icon ?? 'shopping-cart')
  const [isSinkingFund, setIsSinkingFund] = useState(category?.isSinkingFund ?? false)
  const [sinkingMonths, setSinkingMonths] = useState(category?.sinkingFundTargetMonths ?? 12)
  const setSaving = onSavingChange

  const income = summary?.totalIncome ?? 0

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    setSaving(true)
    try {
      const payload = {
        name,
        pillar,
        percentOfIncome: percent,
        budgetMode,
        fixedMonthlyBudget: budgetMode === 'fixed' ? fixedBudget : undefined,
        color,
        icon,
        isSinkingFund,
        sinkingFundTargetMonths: isSinkingFund ? sinkingMonths : undefined,
      }

      if (category) {
        await updateCategory(category.id, payload)
        toast.success('Kategori diperbarui')
      } else {
        await addCategory(payload)
        toast.success('Kategori ditambahkan')
      }
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan kategori')
    } finally {
      setSaving(false)
    }
  }

  const SelectedIcon = CATEGORY_ICONS[icon]

  return (
    <form id={FORM_ID} onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: color }}
        >
          <SelectedIcon className="size-5" aria-hidden />
        </span>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="cat-name" className="text-xs">
            Nama kategori
          </Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Makan & Minum"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat-pillar" className="text-xs">
          Pilar
        </Label>
        <Select value={pillar} onValueChange={(value) => setPillar(value as Pillar)}>
          <SelectTrigger id="cat-pillar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEND_PILLARS.map((option) => (
              <SelectItem key={option} value={option}>
                {PILLAR_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setBudgetMode('percent')}
            aria-pressed={budgetMode === 'percent'}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 font-medium transition-colors',
              budgetMode === 'percent'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Persentase pemasukan
          </button>
          <button
            type="button"
            onClick={() => setBudgetMode('fixed')}
            aria-pressed={budgetMode === 'fixed'}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 font-medium transition-colors',
              budgetMode === 'fixed'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Nominal tetap
          </button>
        </div>

        {budgetMode === 'percent' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <Label htmlFor="cat-percent" className="text-xs">
                Persentase dari pemasukan
              </Label>
              {income > 0 && (
                <span className="tabular text-xs text-muted-foreground">
                  {formatIDR((income * percent) / 100)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                id="cat-percent"
                type="range"
                min={0}
                max={60}
                step={0.5}
                value={percent}
                onChange={(event) => setPercent(Number(event.target.value))}
                className="min-w-0 flex-1 accent-primary"
              />
              <PercentInput
                value={percent}
                onChange={setPercent}
                min={0}
                max={60}
                className="h-8 w-20 text-xs"
                aria-label="Persentase dari pemasukan"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="cat-fixed" className="text-xs">
              Anggaran per bulan
            </Label>
            <MoneyInput
              id="cat-fixed"
              value={fixedBudget}
              onChange={setFixedBudget}
              className="h-9"
              aria-label="Anggaran tetap per bulan"
            />
            <p className="text-[11px] text-muted-foreground">
              Nominal tetap tiap bulan, tidak ikut naik saat pemasukan bertambah.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium">Ikon</span>
        {/* Fixed at 10 columns regardless of screen size squeezed every icon under the
            44px touch-target minimum on a phone-width Drawer — scale with viewport
            instead. */}
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 lg:grid-cols-10">
          {(Object.keys(CATEGORY_ICONS) as CategoryIcon[]).map((key) => {
            const Icon = CATEGORY_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                aria-label={`Ikon ${key}`}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border transition-colors',
                  icon === key ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium">Warna</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Warna ${preset}`}
              aria-pressed={color === preset}
              onClick={() => setColor(preset)}
              className={cn(
                'size-7 rounded-lg border-2 transition-transform',
                color === preset ? 'scale-110 border-foreground' : 'border-transparent',
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="size-7 cursor-pointer rounded-lg border bg-transparent"
            aria-label="Warna kustom"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border p-3">
        <div className="min-w-0 pr-3">
          <p className="text-sm font-medium">Sinking fund</p>
          <p className="text-xs text-muted-foreground">
            Dana yang dikumpulkan bertahap untuk pengeluaran besar nanti.
          </p>
        </div>
        <Switch
          checked={isSinkingFund}
          onCheckedChange={setIsSinkingFund}
          aria-label="Sinking fund"
        />
      </div>

      {isSinkingFund && (
        <div className="space-y-1.5">
          <Label htmlFor="cat-months" className="text-xs">
            Target terkumpul dalam (bulan)
          </Label>
          <Input
            id="cat-months"
            type="number"
            min={1}
            max={120}
            value={sinkingMonths}
            onChange={(event) => setSinkingMonths(Number(event.target.value))}
          />
        </div>
      )}

    </form>
  )
}

export function CategoryForm({
  open,
  onOpenChange,
  category,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}) {
  const [saving, setSaving] = useState(false)
  const title = category ? 'Ubah kategori' : 'Kategori baru'

  return (
    <ModalFormShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Atur pilar, porsi anggaran, ikon, dan warna."
      footer={
        <Button form={FORM_ID} type="submit" className="w-full sm:w-auto" disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {category ? 'Simpan perubahan' : 'Tambah kategori'}
        </Button>
      }
    >
      {open && (
        <FormBody
          category={category}
          onDone={() => onOpenChange(false)}
          onSavingChange={setSaving}
        />
      )}
    </ModalFormShell>
  )
}
