'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Droplets,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { GoalJar } from '@/shared/components/finance/GoalJar'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { SavingsProgressRing } from '@/shared/components/finance/SavingsProgressRing'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { formatDay, formatIDR, formatPercent } from '@/shared/lib/format'
import { projectSavings, requiredContribution } from '@/shared/lib/analytics'
import { fireConfetti } from '@/shared/lib/confetti'
import { hapticSuccess } from '@/shared/lib/haptics'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import type { SavingsGoal } from '@/shared/types/domain'
import { ContributionTimeline } from './components/ContributionTimeline'

const PRIORITY_META = {
  high: { label: 'Tinggi', variant: 'destructive' as const },
  medium: { label: 'Sedang', variant: 'secondary' as const },
  low: { label: 'Rendah', variant: 'outline' as const },
}

const EMOJI_CHOICES = ['🏠', '🚗', '✈️', '💻', '📱', '🎓', '💍', '🏥', '🎁', '📷', '🛵', '🪴']

/** 25/50/75/100 — the milestones the plan wants celebrated. */
const MILESTONES = [25, 50, 75, 100]

/** Highest milestone percent already crossed at `percent`, for before/after comparison. */
function milestoneCrossed(percent: number): number {
  return [...MILESTONES].reverse().find((m) => percent >= m) ?? 0
}

function GoalForm({
  goal,
  open,
  onOpenChange,
  onSaved,
}: {
  goal: SavingsGoal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const categories = useMasterDataStore((s) => s.categories)

  const savingsCategories = categories.filter((c) => c.isActive && c.pillar === 'savings')

  const [name, setName] = useState(goal?.name ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🎯')
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? 0)
  const [monthly, setMonthly] = useState(goal?.monthlyContribution ?? 0)
  const [priority, setPriority] = useState(goal?.priority ?? 'medium')
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? savingsCategories[0]?.id ?? '')
  const [targetDate, setTargetDate] = useState(
    goal?.targetDate
      ? `${goal.targetDate.toDate().getFullYear()}-${String(goal.targetDate.toDate().getMonth() + 1).padStart(2, '0')}-${String(goal.targetDate.toDate().getDate()).padStart(2, '0')}`
      : '',
  )
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) return
    if (!name.trim()) return toast.error('Nama target wajib diisi')
    if (targetAmount <= 0) return toast.error('Target harus lebih dari nol')
    if (!categoryId) return toast.error('Pilih kategori tabungan dulu')

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        categoryId,
        targetAmount,
        monthlyContribution: monthly,
        priority,
        emoji,
        targetDate: targetDate ? new Date(`${targetDate}T12:00:00`) : undefined,
      }

      if (goal) await repositories.goals.update(userId, goal.id, payload)
      else await repositories.goals.create(userId, payload)

      toast.success(goal ? 'Target diperbarui' : 'Target dibuat')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan target')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? 'Ubah target' : 'Target baru'}</DialogTitle>
        </DialogHeader>

        {savingsCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Buat dulu minimal satu kategori di pilar Tabungan lewat Master Data.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium">Emoji</span>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-label={`Emoji ${choice}`}
                    aria-pressed={emoji === choice}
                    onClick={() => setEmoji(choice)}
                    className={`rounded-lg border px-2 py-1 text-lg ${emoji === choice ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="goal-name" className="text-xs">
                Nama target
              </Label>
              <Input
                id="goal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Dana darurat 6 bulan"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="goal-target" className="text-xs">
                  Target
                </Label>
                <MoneyInput id="goal-target" value={targetAmount} onChange={setTargetAmount} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-monthly" className="text-xs">
                  Setoran per bulan
                </Label>
                <MoneyInput id="goal-monthly" value={monthly} onChange={setMonthly} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="goal-date" className="text-xs">
                  Target tanggal <span className="text-muted-foreground">(opsional)</span>
                </Label>
                <Input
                  id="goal-date"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-priority" className="text-xs">
                  Prioritas
                </Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as typeof priority)}
                >
                  <SelectTrigger id="goal-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Tinggi</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="low">Rendah</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="goal-category" className="text-xs">
                Kategori tabungan
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="goal-category">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {savingsCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContributionDialog({
  goal,
  suggestedAmount,
  onOpenChange,
  onSaved,
}: {
  goal: SavingsGoal | null
  suggestedAmount?: number
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed the suggested amount whenever a different goal opens.
  useEffect(() => {
    setAmount(suggestedAmount ?? 0)
    setNote('')
  }, [goal?.id, suggestedAmount])

  if (!goal) return null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId || amount <= 0) return toast.error('Jumlah harus lebih dari nol')

    setSaving(true)
    try {
      const before = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0
      await repositories.goals.addContribution(userId, goal.id, amount, note.trim() || undefined)
      const after =
        goal.targetAmount > 0 ? ((goal.currentAmount + amount) / goal.targetAmount) * 100 : 0

      toast.success(`${formatIDR(amount)} ditambahkan ke ${goal.name}`)
      hapticSuccess()

      // Celebrate only the crossing itself, not every setoran once past a milestone.
      if (milestoneCrossed(after) > milestoneCrossed(before)) fireConfetti()

      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menambah setoran')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Setor ke {goal.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contrib-amount" className="text-xs">
              Jumlah
            </Label>
            <MoneyInput id="contrib-amount" value={amount} onChange={setAmount} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contrib-note" className="text-xs">
              Catatan <span className="text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="contrib-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Setor
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Jika setoran naik jadi Rp X..." — live recompute, nothing persisted until the user acts on it. */
function ForecastSlider({ goal }: { goal: SavingsGoal }) {
  const [monthly, setMonthly] = useState(goal.monthlyContribution)
  const projection = projectSavings(goal.currentAmount, goal.targetAmount, monthly)
  // A sensible top end for the slider: enough to finish within a year, at minimum 100rb steps.
  const max = Math.max(goal.monthlyContribution * 3, Math.ceil(goal.targetAmount / 12 / 100_000) * 100_000, 100_000)

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles className="size-3.5 text-savings" aria-hidden />
          Simulasi setoran
        </span>
        <MoneyDisplay value={monthly} className="font-semibold" compact />
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={50_000}
        value={monthly}
        onChange={(event) => setMonthly(Number(event.target.value))}
        className="w-full accent-savings"
        aria-label="Simulasi setoran bulanan"
      />
      <p className="text-xs text-muted-foreground">
        {projection.monthsToTarget === 0
          ? 'Target sudah tercapai.'
          : projection.projectedDate
            ? `Dengan ${formatIDR(monthly)}/bulan, tercapai ~${formatDay(projection.projectedDate)} (${projection.monthsToTarget} bulan).`
            : 'Naikkan setoran untuk melihat perkiraan tanggal tercapai.'}
      </p>
    </div>
  )
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
  onDelete,
  onHistory,
}: {
  goal: SavingsGoal
  onEdit: (goal: SavingsGoal) => void
  onContribute: (goal: SavingsGoal) => void
  onDelete: (goal: SavingsGoal) => void
  onHistory: (goal: SavingsGoal) => void
}) {
  const [view, setView] = useState<'ring' | 'jar'>('ring')
  const percent = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0
  const projection = projectSavings(goal.currentAmount, goal.targetAmount, goal.monthlyContribution)
  const needed = requiredContribution(goal)
  const priority = PRIORITY_META[goal.priority]

  return (
    <Card className="h-full">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            {goal.emoji ?? '🎯'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{goal.name}</p>
            <Badge variant={priority.variant} className="mt-1">
              {priority.label}
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Aksi ${goal.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onContribute(goal)}>Setor dana</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onHistory(goal)}>
                <History className="mr-2 size-4" aria-hidden />
                Riwayat setoran
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(goal)}>Ubah</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(goal)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setView(view === 'ring' ? 'jar' : 'ring')}
            className="rounded-2xl transition-opacity hover:opacity-80"
            aria-label="Ganti tampilan progres"
            title="Ganti tampilan progres"
          >
            {view === 'ring' ? (
              <SavingsProgressRing percent={percent} size={82} />
            ) : (
              <GoalJar percent={percent} size={82} />
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <MoneyDisplay
              value={goal.currentAmount}
              compact
              className="block text-sm font-semibold"
            />
            <p className="text-xs text-muted-foreground">dari {formatIDR(goal.targetAmount)}</p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {projection.monthsToTarget === 0 ? (
            <p className="font-medium text-safe">Target tercapai 🎉</p>
          ) : projection.projectedDate ? (
            <p>
              Perkiraan tercapai{' '}
              <span className="font-medium text-foreground">
                {formatDay(projection.projectedDate)}
              </span>{' '}
              ({projection.monthsToTarget} bulan lagi)
            </p>
          ) : (
            <p>Belum ada setoran bulanan — atur nominalnya untuk melihat perkiraan.</p>
          )}

          {needed !== null && needed > goal.monthlyContribution && (
            <p className="text-warning">
              Perlu {formatIDR(needed)}/bulan untuk mengejar tanggal target.
            </p>
          )}
        </div>

        {goal.monthlyContribution >= 0 && projection.monthsToTarget !== 0 && (
          <ForecastSlider goal={goal} />
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={() => onContribute(goal)}>
          Setor dana
        </Button>
      </CardContent>
    </Card>
  )
}

/** "Alokasikan sisa kas bulan ini ke goal prioritas tertinggi?" */
function AutoContributionSuggestion({
  goals,
  onAccept,
}: {
  goals: SavingsGoal[]
  onAccept: (goal: SavingsGoal, amount: number) => void
}) {
  const summary = useBudgetStore((s) => s.summary)
  const spare = summary ? summary.totalIncome - summary.totalUsed : 0

  const unmet = goals.filter((g) => !g.isAchieved && g.currentAmount < g.targetAmount)
  const priorityRank = { high: 0, medium: 1, low: 2 } as const
  const [target] = [...unmet].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])

  if (spare <= 0 || !target) return null

  const suggested = Math.min(spare, target.targetAmount - target.currentAmount)
  if (suggested <= 0) return null

  return (
    <Card className="border-savings/40 bg-savings/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-savings/15 text-savings">
          <Droplets className="size-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          Sisa kas bulan ini <MoneyDisplay value={spare} compact className="font-semibold" /> —
          alokasikan <MoneyDisplay value={suggested} compact className="font-semibold" /> ke{' '}
          <span className="font-medium">{target.name}</span>?
        </p>
        <Button size="sm" onClick={() => onAccept(target, suggested)}>
          Setor sekarang
        </Button>
      </CardContent>
    </Card>
  )
}

export function GoalsPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const loadAll = useMasterDataStore((s) => s.loadAll)
  const loadBudgetSummary = useBudgetStore((s) => s.loadSummary)

  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)
  const [contributing, setContributing] = useState<SavingsGoal | null>(null)
  const [suggestedAmount, setSuggestedAmount] = useState<number | undefined>(undefined)
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null)

  const load = async () => {
    if (!userId) return
    setLoading(true)
    try {
      setGoals(await repositories.goals.findAll(userId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void loadBudgetSummary()
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const totals = useMemo(
    () => ({
      saved: goals.reduce((sum, goal) => sum + goal.currentAmount, 0),
      target: goals.reduce((sum, goal) => sum + goal.targetAmount, 0),
    }),
    [goals],
  )

  const remove = async (goal: SavingsGoal) => {
    if (!userId) return
    await repositories.goals.delete(userId, goal.id)
    await load()
    toast.success('Target dihapus')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Target tabungan"
        description="Kumpulkan dana untuk rencana besarmu."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="gap-2"
          >
            <Plus className="size-4" aria-hidden />
            Target baru
          </Button>
        }
      />

      {goals.length > 0 && (
        <AutoContributionSuggestion
          goals={goals}
          onAccept={(goal, amount) => {
            setSuggestedAmount(amount)
            setContributing(goal)
          }}
        />
      )}

      {goals.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" aria-hidden />
              Total progres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <MoneyDisplay value={totals.saved} className="font-display text-2xl font-bold" />
              <span className="text-sm text-muted-foreground">dari {formatIDR(totals.target)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatPercent(totals.target > 0 ? (totals.saved / totals.target) * 100 : 0)} dari
              seluruh target terkumpul
            </p>
          </CardContent>
        </Card>
      )}

      {loading && goals.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Belum ada target"
          description="Buat target untuk dana darurat, liburan, atau pembelian besar."
          actionLabel="Buat target pertama"
          onAction={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <li key={goal.id}>
              <GoalCard
                goal={goal}
                onEdit={(next) => {
                  setEditing(next)
                  setFormOpen(true)
                }}
                onContribute={(next) => {
                  setSuggestedAmount(undefined)
                  setContributing(next)
                }}
                onDelete={(next) => void remove(next)}
                onHistory={setHistoryGoal}
              />
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <GoalForm
          goal={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={() => void load()}
        />
      )}

      <ContributionDialog
        goal={contributing}
        suggestedAmount={suggestedAmount}
        onOpenChange={() => setContributing(null)}
        onSaved={() => void load()}
      />

      <ContributionTimeline goal={historyGoal} onOpenChange={() => setHistoryGoal(null)} />
    </div>
  )
}
