'use client'

import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { formatDay, formatIDR } from '@/shared/lib/format'
import { monthlyCommitment, nextDueDate } from '@/shared/lib/recurring'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useRecurringStore } from '@/shared/stores/recurring.store'
import type { RecurringRule } from '@/shared/types/domain'
import { RecurringForm } from './components/RecurringForm'

const FREQUENCY_LABEL = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
} as const

/** Dashboard-and-recurring banner: what is owed this month and not yet recorded. */
export function DueThisMonthBanner() {
  const due = useRecurringStore((s) => s.due)
  const generating = useRecurringStore((s) => s.generating)
  const generate = useRecurringStore((s) => s.generate)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (due.length === 0) return null

  const total = due.reduce((sum, occurrence) => sum + occurrence.rule.amount, 0)

  const run = async () => {
    try {
      const { created, skippedClosedMonth } = await generate()
      if (created > 0) toast.success(`${created} transaksi rutin dibuat`)
      if (skippedClosedMonth > 0) {
        toast.warning(
          `${skippedClosedMonth} dilewati karena bulan sudah ditutup — buka bulan itu dari Pengaturan untuk mencatatnya.`,
        )
      }
      if (created === 0 && skippedClosedMonth === 0) toast.info('Tidak ada tagihan yang perlu dicatat')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuat transaksi')
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <CalendarClock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {formatIDR(total)} tagihan rutin — {due.length} belum dicatat
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {due.map((o) => o.rule.name).join(' · ')}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={generating}
          className="gap-2"
        >
          {generating && <Loader2 className="size-3.5 animate-spin" />}
          Catat semua
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Catat {due.length} transaksi rutin?</AlertDialogTitle>
            <AlertDialogDescription>
              Total {formatIDR(total)} akan ditambahkan ke transaksi bulan ini. Kamu masih bisa
              mengubah atau menghapusnya satu per satu setelahnya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run()}>Catat semua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RuleCard({
  rule,
  onEdit,
}: {
  rule: RecurringRule
  onEdit: (rule: RecurringRule) => void
}) {
  const categories = useMasterDataStore((s) => s.categories)
  const due = useRecurringStore((s) => s.due)
  const toggleActive = useRecurringStore((s) => s.toggleActive)
  const remove = useRecurringStore((s) => s.remove)
  const skip = useRecurringStore((s) => s.skip)

  const category = categories.find((c) => c.id === rule.categoryId)
  const next = nextDueDate(rule)
  const pending = due.filter((occurrence) => occurrence.rule.id === rule.id)

  return (
    <Card className={rule.isActive ? undefined : 'opacity-60'}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{rule.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {category && <PillarColorDot pillar={category.pillar} />}
              {category?.name ?? 'Kategori terhapus'}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Aksi ${rule.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(rule)}>Ubah</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleActive(rule)}>
                {rule.isActive ? (
                  <>
                    <Pause className="mr-2 size-4" aria-hidden />
                    Jeda
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-4" aria-hidden />
                    Aktifkan
                  </>
                )}
              </DropdownMenuItem>
              {pending.length > 0 && (
                <DropdownMenuItem
                  onClick={() => {
                    void skip(rule.id, pending[0].date).then(() =>
                      toast.success(`${rule.name} dilewati untuk ${formatDay(pending[0].date)}`),
                    )
                  }}
                >
                  <SkipForward className="mr-2 size-4" aria-hidden />
                  Lewati kali ini
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => void remove(rule.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <MoneyDisplay value={rule.amount} className="block font-display text-lg font-bold" />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{FREQUENCY_LABEL[rule.frequency]}</Badge>
          {!rule.isActive && <Badge variant="outline">Dijeda</Badge>}
          {pending.length > 0 && (
            <Badge variant="destructive">{pending.length} belum dicatat</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {next ? `Jatuh tempo berikutnya ${formatDay(next)}` : 'Tidak ada jatuh tempo berikutnya'}
        </p>
      </CardContent>
    </Card>
  )
}

export function RecurringPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const rules = useRecurringStore((s) => s.rules)
  const isLoading = useRecurringStore((s) => s.isLoading)
  const load = useRecurringStore((s) => s.load)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRule | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void load()
  }, [userId, year, month, loadAll, load])

  const commitment = monthlyCommitment(rules, year, month)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaksi berulang"
        description={`Komitmen rutin bulan ini: ${formatIDR(commitment)}`}
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="gap-2"
          >
            <Plus className="size-4" aria-hidden />
            Aturan baru
          </Button>
        }
      />

      <DueThisMonthBanner />

      {isLoading && rules.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Belum ada aturan berulang"
          description="Buat aturan untuk langganan, tagihan, atau cicilan agar tidak perlu dicatat manual tiap bulan."
          actionLabel="Buat aturan pertama"
          onAction={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              <RuleCard
                rule={rule}
                onEdit={(next) => {
                  setEditing(next)
                  setFormOpen(true)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <RecurringForm open={formOpen} onOpenChange={setFormOpen} rule={editing} />
    </div>
  )
}
