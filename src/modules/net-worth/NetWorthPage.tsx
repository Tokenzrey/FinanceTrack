'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Camera, Loader2, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { ChartContainer, ChartTooltip } from '@/shared/components/charts/ChartContainer'
import { useChartTheme } from '@/shared/components/charts/chart-theme'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { formatIDR, formatIDRCompact, formatPercent, yearMonthId } from '@/shared/lib/format'
import { comparePayoffStrategies, debtToIncomeRatio } from '@/shared/lib/debt-payoff'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import type {
  Asset,
  AssetType,
  Liability,
  LiabilityType,
  NetWorthSnapshot,
} from '@/shared/types/domain'

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'cash', label: 'Kas' },
  { value: 'savings', label: 'Tabungan' },
  { value: 'investment', label: 'Investasi' },
  { value: 'property', label: 'Properti' },
  { value: 'vehicle', label: 'Kendaraan' },
  { value: 'other', label: 'Lainnya' },
]

const LIABILITY_TYPES: { value: LiabilityType; label: string }[] = [
  { value: 'kpr', label: 'KPR' },
  { value: 'kta', label: 'KTA' },
  { value: 'vehicle_loan', label: 'Cicilan kendaraan' },
  { value: 'credit_card', label: 'Kartu kredit' },
  { value: 'other', label: 'Lainnya' },
]

function AssetForm({
  asset,
  open,
  onOpenChange,
  onSaved,
}: {
  asset: Asset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const [name, setName] = useState(asset?.name ?? '')
  const [type, setType] = useState<AssetType>(asset?.type ?? 'cash')
  const [value, setValue] = useState(asset?.value ?? 0)
  const [institution, setInstitution] = useState(asset?.institution ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId || !name.trim()) return toast.error('Nama aset wajib diisi')

    setSaving(true)
    try {
      await repositories.netWorth.upsertAsset(userId, {
        id: asset?.id,
        name: name.trim(),
        type,
        value,
        institution: institution.trim() || undefined,
      })
      toast.success(asset ? 'Aset diperbarui' : 'Aset ditambahkan')
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? 'Ubah aset' : 'Aset baru'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="asset-name" className="text-xs">
              Nama
            </Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tabungan BCA"
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="asset-type" className="text-xs">
                Jenis
              </Label>
              <Select value={type} onValueChange={(next) => setType(next as AssetType)}>
                <SelectTrigger id="asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-value" className="text-xs">
                Nilai
              </Label>
              <MoneyInput id="asset-value" value={value} onChange={setValue} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-institution" className="text-xs">
              Institusi <span className="text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="asset-institution"
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LiabilityForm({
  liability,
  open,
  onOpenChange,
  onSaved,
}: {
  liability: Liability | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const [name, setName] = useState(liability?.name ?? '')
  const [type, setType] = useState<LiabilityType>(liability?.type ?? 'credit_card')
  const [total, setTotal] = useState(liability?.totalAmount ?? 0)
  const [remaining, setRemaining] = useState(liability?.remainingAmount ?? 0)
  const [monthly, setMonthly] = useState(liability?.monthlyPayment ?? 0)
  const [rate, setRate] = useState(liability?.interestRate ?? 0)
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId || !name.trim()) return toast.error('Nama utang wajib diisi')

    setSaving(true)
    try {
      await repositories.netWorth.upsertLiability(userId, {
        id: liability?.id,
        name: name.trim(),
        type,
        totalAmount: total,
        remainingAmount: remaining,
        monthlyPayment: monthly,
        interestRate: rate || undefined,
      })
      toast.success(liability ? 'Utang diperbarui' : 'Utang ditambahkan')
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{liability ? 'Ubah utang' : 'Utang baru'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="liab-name" className="text-xs">
              Nama
            </Label>
            <Input
              id="liab-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="KPR Rumah"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="liab-type" className="text-xs">
              Jenis
            </Label>
            <Select value={type} onValueChange={(next) => setType(next as LiabilityType)}>
              <SelectTrigger id="liab-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIABILITY_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="liab-total" className="text-xs">
                Total pinjaman
              </Label>
              <MoneyInput id="liab-total" value={total} onChange={setTotal} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liab-remaining" className="text-xs">
                Sisa
              </Label>
              <MoneyInput id="liab-remaining" value={remaining} onChange={setRemaining} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="liab-monthly" className="text-xs">
                Cicilan per bulan
              </Label>
              <MoneyInput id="liab-monthly" value={monthly} onChange={setMonthly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liab-rate" className="text-xs">
                Bunga per tahun (%)
              </Label>
              <Input
                id="liab-rate"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DebtPayoffSimulator({ liabilities }: { liabilities: Liability[] }) {
  const [extra, setExtra] = useState(0)
  const result = useMemo(() => comparePayoffStrategies(liabilities, extra), [liabilities, extra])

  const open = liabilities.filter((item) => item.remainingAmount > 0)
  if (open.length === 0) return null

  const describe = (months: number | null) =>
    months === null ? 'tidak pernah lunas' : `${months} bulan`

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Simulasi pelunasan utang</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="extra-payment" className="text-xs">
            Dana ekstra per bulan
          </Label>
          <MoneyInput id="extra-payment" value={extra} onChange={setExtra} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-sm font-medium">Avalanche</p>
            <p className="text-xs text-muted-foreground">Bunga tertinggi dulu</p>
            <p className="tabular mt-2 text-sm">
              Lunas {describe(result.avalanche.monthsToDebtFree)}
            </p>
            <p className="text-xs text-muted-foreground">
              Total bunga {formatIDR(result.avalanche.totalInterest)}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-sm font-medium">Snowball</p>
            <p className="text-xs text-muted-foreground">Saldo terkecil dulu</p>
            <p className="tabular mt-2 text-sm">
              Lunas {describe(result.snowball.monthsToDebtFree)}
            </p>
            <p className="text-xs text-muted-foreground">
              Total bunga {formatIDR(result.snowball.totalInterest)}
            </p>
          </div>
        </div>

        {result.interestSaved > 1000 ? (
          <p className="rounded-xl border border-safe/30 bg-safe/10 p-3 text-sm text-safe">
            Avalanche menghemat {formatIDR(result.interestSaved)} bunga
            {result.monthsDifference && result.monthsDifference > 0
              ? ` dan selesai ${result.monthsDifference} bulan lebih cepat`
              : ''}
            .
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Kedua metode hampir sama untuk komposisi utang ini — pilih yang paling memotivasi.
          </p>
        )}

        {result.avalanche.monthsToDebtFree === null && (
          <p className="rounded-xl border border-exceeded/30 bg-exceeded/10 p-3 text-xs text-exceeded">
            Dengan cicilan sekarang, bunga tumbuh lebih cepat dari pembayaran. Tambah dana ekstra
            atau negosiasikan bunga.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function NetWorthTrend({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  const { colors, ink } = useChartTheme()

  const data = [...snapshots]
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    .map((snapshot) => ({
      label: snapshot.yearMonth,
      netWorth: snapshot.netWorth,
    }))

  if (data.length < 2) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Ambil snapshot minimal dua bulan untuk melihat trennya.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: ink.grid }}
          tick={{ fill: ink.label, fontSize: 10 }}
        />
        <YAxis
          tickFormatter={(value: number) => formatIDRCompact(value)}
          tickLine={false}
          axisLine={false}
          tick={{ fill: ink.label, fontSize: 11 }}
          width={68}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as (typeof data)[number]
            return (
              <ChartTooltip
                title={String(label)}
                rows={[{ label: 'Kekayaan bersih', value: point.netWorth, color: colors.savings }]}
              />
            )
          }}
        />
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke={colors.savings}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: colors.savings }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: ink.surface }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function NetWorthPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const summary = useBudgetStore((s) => s.summary)

  const [assets, setAssets] = useState<Asset[]>([])
  const [liabilities, setLiabilities] = useState<Liability[]>([])
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [assetForm, setAssetForm] = useState<{ open: boolean; asset: Asset | null }>({
    open: false,
    asset: null,
  })
  const [liabilityForm, setLiabilityForm] = useState<{
    open: boolean
    liability: Liability | null
  }>({ open: false, liability: null })
  const [snapshotting, setSnapshotting] = useState(false)

  const load = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [assetRows, liabilityRows, snapshotRows] = await Promise.all([
        repositories.netWorth.findAssets(userId),
        repositories.netWorth.findLiabilities(userId),
        repositories.netWorth.findSnapshots(userId),
      ])
      setAssets(assetRows)
      setLiabilities(liabilityRows)
      setSnapshots(snapshotRows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const totalAssets = assets.reduce((sum, asset) => sum + asset.value, 0)
  const totalLiabilities = liabilities.reduce((sum, item) => sum + item.remainingAmount, 0)
  const netWorth = totalAssets - totalLiabilities
  const dti = debtToIncomeRatio(liabilities, summary?.totalIncome ?? 0)

  const previous = snapshots.find((s) => s.yearMonth !== yearMonthId(year, month))
  const change = previous ? netWorth - previous.netWorth : null

  const takeSnapshot = async () => {
    if (!userId) return
    setSnapshotting(true)
    try {
      await repositories.netWorth.saveSnapshot(
        userId,
        yearMonthId(year, month),
        assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          value: asset.value,
          institution: asset.institution,
        })),
        liabilities.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          totalAmount: item.totalAmount,
          remainingAmount: item.remainingAmount,
          monthlyPayment: item.monthlyPayment,
          interestRate: item.interestRate,
        })),
      )
      await load()
      toast.success('Snapshot bulan ini tersimpan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan snapshot')
    } finally {
      setSnapshotting(false)
    }
  }

  const deleteAsset = async (asset: Asset) => {
    if (!userId) return
    await repositories.netWorth.deleteAsset(userId, asset.id)
    await load()
  }

  const deleteLiability = async (item: Liability) => {
    if (!userId) return
    await repositories.netWorth.deleteLiability(userId, item.id)
    await load()
  }

  if (loading && assets.length === 0 && liabilities.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingSkeleton rows={5} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kekayaan bersih"
        description="Total aset dikurangi utang."
        actions={
          <Button
            variant="outline"
            onClick={() => void takeSnapshot()}
            disabled={snapshotting || (assets.length === 0 && liabilities.length === 0)}
            className="gap-2"
          >
            {snapshotting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" aria-hidden />
            )}
            Ambil snapshot
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">Total aset</p>
            <MoneyDisplay
              value={totalAssets}
              compact
              className="block font-display text-xl font-bold"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">Total utang</p>
            <MoneyDisplay
              value={totalLiabilities}
              compact
              className="block font-display text-xl font-bold"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">Kekayaan bersih</p>
            <MoneyDisplay
              value={netWorth}
              compact
              signed
              className="block font-display text-xl font-bold"
            />
            {change !== null && (
              <p className={`text-xs ${change >= 0 ? 'text-safe' : 'text-exceeded'}`}>
                {change >= 0 ? '+' : ''}
                {formatIDRCompact(change)} vs snapshot lalu
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">Rasio utang</p>
            <p className="font-display text-xl font-bold">{formatPercent(dti)}</p>
            <p className="text-xs text-muted-foreground">Aman di bawah 30%</p>
          </CardContent>
        </Card>
      </div>

      {snapshots.length >= 2 && (
        <ChartContainer title="Tren kekayaan bersih" height={240}>
          <NetWorthTrend snapshots={snapshots} />
        </ChartContainer>
      )}

      <Tabs defaultValue="assets">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="assets">Aset ({assets.length})</TabsTrigger>
          <TabsTrigger value="liabilities">Utang ({liabilities.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setAssetForm({ open: true, asset: null })} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Aset baru
            </Button>
          </div>

          {assets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Belum ada aset"
              description="Catat kas, tabungan, investasi, atau properti yang kamu miliki."
            />
          ) : (
            <ul className="space-y-2">
              {assets.map((asset) => (
                <li key={asset.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ASSET_TYPES.find((t) => t.value === asset.type)?.label}
                      {asset.institution ? ` · ${asset.institution}` : ''}
                    </p>
                  </div>
                  <MoneyDisplay value={asset.value} compact className="font-medium" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setAssetForm({ open: true, asset })}
                    aria-label={`Ubah ${asset.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    onClick={() => void deleteAsset(asset)}
                    aria-label={`Hapus ${asset.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="liabilities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => setLiabilityForm({ open: true, liability: null })}
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden />
              Utang baru
            </Button>
          </div>

          {liabilities.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Belum ada utang tercatat"
              description="Catat KPR, KTA, cicilan kendaraan, atau kartu kredit untuk melihat simulasi pelunasan."
            />
          ) : (
            <>
              <ul className="space-y-2">
                {liabilities.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {LIABILITY_TYPES.find((t) => t.value === item.type)?.label}
                        {item.interestRate ? ` · ${formatPercent(item.interestRate, 1)}/thn` : ''}
                        {item.monthlyPayment ? ` · ${formatIDR(item.monthlyPayment)}/bln` : ''}
                      </p>
                    </div>
                    {item.remainingAmount === 0 && <Badge variant="secondary">Lunas</Badge>}
                    <MoneyDisplay value={item.remainingAmount} compact className="font-medium" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setLiabilityForm({ open: true, liability: item })}
                      aria-label={`Ubah ${item.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => void deleteLiability(item)}
                      aria-label={`Hapus ${item.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>

              <DebtPayoffSimulator liabilities={liabilities} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {assetForm.open && (
        <AssetForm
          asset={assetForm.asset}
          open={assetForm.open}
          onOpenChange={(open) => setAssetForm({ open, asset: null })}
          onSaved={() => void load()}
        />
      )}

      {liabilityForm.open && (
        <LiabilityForm
          liability={liabilityForm.liability}
          open={liabilityForm.open}
          onOpenChange={(open) => setLiabilityForm({ open, liability: null })}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
