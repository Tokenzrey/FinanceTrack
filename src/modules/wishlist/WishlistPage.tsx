'use client'

import { useEffect, useState } from 'react'
import {
  Clock,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import { cn } from '@/shared/lib/utils'
import { formatIDR } from '@/shared/lib/format'
import { coolingOffDaysLeft, isCoolingOff } from '@/shared/lib/affordability'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useWishlistStore } from '@/shared/stores/wishlist.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import {
  FINANCING_LABELS,
  JUSTIFICATION_LABELS,
  STATUS_LABELS,
  type FinancingMethod,
  type Justification,
  type Wishlist,
  type WishlistPriority,
  type WishlistStatus,
} from '@/shared/types/wishlist.types'
import { AffordabilityDetail, DECISION_STYLE } from './components/AffordabilityDetail'

const STATUS_FLOW: WishlistStatus[] = ['idea', 'saving', 'ready_to_buy']

function WishlistForm({
  item,
  open,
  onOpenChange,
}: {
  item: Wishlist | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useWishlistStore((s) => s.create)
  const update = useWishlistStore((s) => s.update)
  const extendCoolingOff = useWishlistStore((s) => s.extendCoolingOff)

  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item?.estimatedPrice ?? 0)
  const [url, setUrl] = useState(item?.url ?? '')
  const [priority, setPriority] = useState<WishlistPriority>(item?.priority ?? 'medium')
  const [justification, setJustification] = useState<Justification>(item?.justification ?? 'want')
  const [financing, setFinancing] = useState<FinancingMethod>(item?.financingMethod ?? 'cash')
  const [installment, setInstallment] = useState(item?.estimatedMonthlyInstallment ?? 0)
  const [tenure, setTenure] = useState(item?.installmentTenureMonths ?? 12)
  const [coolingOffDays, setCoolingOffDays] = useState(7)
  const [extraDays, setExtraDays] = useState(7)
  const [saving, setSaving] = useState(false)
  const [extending, setExtending] = useState(false)

  const activeCoolingOff = item && isCoolingOff(item)

  const financed = financing === 'credit_card' || financing === 'paylater'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return toast.error('Nama barang wajib diisi')
    if (price <= 0) return toast.error('Estimasi harga harus lebih dari nol')
    if (financed && installment <= 0) return toast.error('Isi estimasi cicilan per bulan')

    setSaving(true)
    try {
      const payload = {
        name,
        estimatedPrice: price,
        url: url.trim() || undefined,
        priority,
        justification,
        financingMethod: financing,
        estimatedMonthlyInstallment: financed ? installment : undefined,
        installmentTenureMonths: financed ? tenure : undefined,
      }

      if (item) await update(item.id, payload)
      else await create({ ...payload, coolingOffDays })

      toast.success(item ? 'Wishlist diperbarui' : 'Ditambahkan ke wishlist')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const extendNow = async () => {
    if (!item || extraDays <= 0) return
    setExtending(true)
    try {
      await extendCoolingOff(item.id, extraDays)
      toast.success(`Masa tunggu diperpanjang ${extraDays} hari`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memperpanjang masa tunggu')
    } finally {
      setExtending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Ubah rencana beli' : 'Rencana beli baru'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wish-name" className="text-xs">
              Nama barang
            </Label>
            <Input
              id="wish-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="iPhone 16"
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wish-price" className="text-xs">
                Estimasi harga
              </Label>
              <MoneyInput id="wish-price" value={price} onChange={setPrice} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wish-priority" className="text-xs">
                Prioritas
              </Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as WishlistPriority)}
              >
                <SelectTrigger id="wish-priority">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wish-justification" className="text-xs">
                Alasan
              </Label>
              <Select
                value={justification}
                onValueChange={(value) => setJustification(value as Justification)}
              >
                <SelectTrigger id="wish-justification">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(JUSTIFICATION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wish-financing" className="text-xs">
                Cara bayar
              </Label>
              <Select
                value={financing}
                onValueChange={(value) => setFinancing(value as FinancingMethod)}
              >
                <SelectTrigger id="wish-financing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FINANCING_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {financed && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wish-installment" className="text-xs">
                  Cicilan per bulan
                </Label>
                <MoneyInput id="wish-installment" value={installment} onChange={setInstallment} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wish-tenure" className="text-xs">
                  Tenor (bulan)
                </Label>
                <Input
                  id="wish-tenure"
                  type="number"
                  min={1}
                  max={120}
                  value={tenure}
                  onChange={(event) => setTenure(Number(event.target.value))}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wish-url" className="text-xs">
              Tautan produk <span className="text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="wish-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
            />
          </div>

          {!item && (
            <div className="space-y-1.5">
              <Label htmlFor="wish-cooling" className="text-xs">
                Masa tunggu (hari)
              </Label>
              <Input
                id="wish-cooling"
                type="number"
                min={0}
                max={90}
                value={coolingOffDays}
                onChange={(event) => setCoolingOffDays(Number(event.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Jeda sebelum boleh ditandai dibeli, untuk menahan belanja impulsif.
              </p>
            </div>
          )}

          {activeCoolingOff && (
            <div className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs font-medium">
                Masa tunggu masih berjalan — {coolingOffDaysLeft(item!)} hari lagi.
              </p>
              <p className="text-xs text-muted-foreground">
                Bisa diperpanjang, tapi tidak bisa dipersingkat — itu maksud dari fitur ini.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={extraDays}
                  onChange={(event) => setExtraDays(Number(event.target.value))}
                  className="h-8 w-20"
                  aria-label="Tambah hari"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void extendNow()}
                  disabled={extending || extraDays <= 0}
                >
                  {extending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  Tambah hari
                </Button>
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

function PurchaseDialog({
  item,
  onOpenChange,
}: {
  item: Wishlist | null
  onOpenChange: (open: boolean) => void
}) {
  const categories = useMasterDataStore((s) => s.categories)
  const markPurchased = useWishlistStore((s) => s.markPurchased)

  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  const [actualPrice, setActualPrice] = useState(item?.estimatedPrice ?? 0)
  const [categoryId, setCategoryId] = useState(spendCategories[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  if (!item) return null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await markPurchased(item, { actualPrice, categoryId })
      toast.success(`${item.name} tercatat sebagai pengeluaran ${formatIDR(actualPrice)}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mencatat pembelian')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tandai {item.name} sebagai dibeli</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="purchase-price" className="text-xs">
              Harga sebenarnya
            </Label>
            <MoneyInput
              id="purchase-price"
              value={actualPrice}
              onChange={setActualPrice}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Estimasi awal {formatIDR(item.estimatedPrice)}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchase-category" className="text-xs">
              Kategori pengeluaran
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="purchase-category">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {spendCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Transaksi pengeluaran akan dibuat di jurnal utama dan item ini pindah ke
            &ldquo;Dibeli&rdquo;.
          </p>

          <Button type="submit" className="w-full" disabled={saving || !categoryId}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Catat pembelian
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function WishlistCard({
  item,
  onDetail,
  onEdit,
  onPurchase,
}: {
  item: Wishlist
  onDetail: (item: Wishlist) => void
  onEdit: (item: Wishlist) => void
  onPurchase: (item: Wishlist) => void
}) {
  const setStatus = useWishlistStore((s) => s.setStatus)
  const remove = useWishlistStore((s) => s.remove)

  const analytics = item.affordabilityAnalytics
  const style = analytics ? DECISION_STYLE[analytics.decision] : null
  const waiting = isCoolingOff(item)
  const daysLeft = coolingOffDaysLeft(item)
  const purchased = item.status === 'purchased'

  return (
    <Card className={cn('h-full', purchased && 'opacity-70')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {JUSTIFICATION_LABELS[item.justification]} · {FINANCING_LABELS[item.financingMethod]}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Aksi ${item.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDetail(item)}>Lihat analisis</DropdownMenuItem>
              {!purchased && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(item)}>Ubah</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {STATUS_FLOW.filter((status) => status !== item.status).map((status) => (
                    <DropdownMenuItem key={status} onClick={() => void setStatus(item.id, status)}>
                      Pindah ke {STATUS_LABELS[status]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => void setStatus(item.id, 'cancelled')}>
                    Batalkan
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void remove(item.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <MoneyDisplay
          value={purchased ? (item.actualPrice ?? item.estimatedPrice) : item.estimatedPrice}
          className="block font-display text-lg font-bold"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{STATUS_LABELS[item.status]}</Badge>
          {item.priority === 'high' && <Badge variant="destructive">Prioritas tinggi</Badge>}
          {waiting && (
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3" aria-hidden />
              Tunggu {daysLeft} hari
            </Badge>
          )}
        </div>

        {analytics && style && !purchased && (
          <button
            type="button"
            onClick={() => onDetail(item)}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium',
              style.className,
            )}
          >
            <style.icon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{analytics.decision}</span>
            <span className="tabular shrink-0">{analytics.recommendationScore}</span>
          </button>
        )}

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            Lihat produk
          </a>
        )}

        {!purchased && item.status !== 'cancelled' && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={waiting}
            onClick={() => onPurchase(item)}
            title={waiting ? `Masa tunggu berakhir dalam ${daysLeft} hari` : undefined}
          >
            {waiting ? `Masa tunggu ${daysLeft} hari` : 'Tandai dibeli'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function WishlistPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const items = useWishlistStore((s) => s.items)
  const isLoading = useWishlistStore((s) => s.isLoading)
  const load = useWishlistStore((s) => s.load)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wishlist | null>(null)
  const [detail, setDetail] = useState<Wishlist | null>(null)
  const [purchasing, setPurchasing] = useState<Wishlist | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void load()
  }, [userId, year, month, loadAll, load])

  const active = items.filter((item) => item.status !== 'purchased' && item.status !== 'cancelled')
  const done = items.filter((item) => item.status === 'purchased' || item.status === 'cancelled')
  const plannedTotal = active.reduce((sum, item) => sum + item.estimatedPrice, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Wishlist"
        description="Rencana pembelian dengan rekomendasi keputusan otomatis."
        actions={
          <>
            <PeriodSelector />
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden />
              Rencana baru
            </Button>
          </>
        }
      />

      {active.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Total rencana aktif</p>
              <MoneyDisplay value={plannedTotal} className="font-display text-xl font-bold" />
            </div>
            <p className="text-xs text-muted-foreground">{active.length} barang direncanakan</p>
          </CardContent>
        </Card>
      )}

      {isLoading && items.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Belum ada rencana pembelian"
          description="Catat barang yang ingin dibeli, dan sistem menghitung apakah kondisi keuanganmu siap."
          actionLabel="Tambah rencana pertama"
          onAction={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((item) => (
              <li key={item.id}>
                <WishlistCard
                  item={item}
                  onDetail={setDetail}
                  onEdit={(next) => {
                    setEditing(next)
                    setFormOpen(true)
                  }}
                  onPurchase={setPurchasing}
                />
              </li>
            ))}
          </ul>

          {done.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Selesai ({done.length})</h3>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {done.map((item) => (
                  <li key={item.id}>
                    <WishlistCard
                      item={item}
                      onDetail={setDetail}
                      onEdit={(next) => {
                        setEditing(next)
                        setFormOpen(true)
                      }}
                      onPurchase={setPurchasing}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {formOpen && <WishlistForm item={editing} open={formOpen} onOpenChange={setFormOpen} />}

      <AffordabilityDetail item={detail} onOpenChange={() => setDetail(null)} />
      <PurchaseDialog item={purchasing} onOpenChange={() => setPurchasing(null)} />
    </div>
  )
}
