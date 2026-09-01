'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { formatIDR } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useScannerStore } from '@/shared/stores/receipt-scanner.store'
import type { ReceiptScanRecord, ScanMode } from '@/shared/types/receipt-scanner.types'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ItemCategorySelector } from './ItemCategorySelector'

interface ReviewRow {
  name: string
  amount: number
  categoryId: string | null
}

function toDateInput(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return toDateInput(null)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function ReceiptReviewDrawer({
  record,
  onSaved,
}: {
  record: ReceiptScanRecord
  onSaved: (count: number) => void
}) {
  const categories = useMasterDataStore((s) => s.categories)
  const mode = useScannerStore((s) => s.mode)
  const setMode = useScannerStore((s) => s.setMode)
  const save = useScannerStore((s) => s.save)
  const discard = useScannerStore((s) => s.discard)

  const { extraction, mappedItems, warnings, totalConfidence } = record.scanResult

  const [rows, setRows] = useState<ReviewRow[]>(() =>
    mappedItems.map((item) => ({
      name: item.name,
      amount: item.totalPrice,
      categoryId: item.suggestedCategoryId,
    })),
  )
  const [date, setDate] = useState(() => toDateInput(extraction.date))
  const [singleAmount, setSingleAmount] = useState(extraction.total)
  const [singleCategoryId, setSingleCategoryId] = useState<string | null>(
    // Default to the category the AI picked most often across the items.
    mostCommonCategory(mappedItems.map((i) => i.suggestedCategoryId)),
  )
  const [description, setDescription] = useState(
    extraction.merchant ? `Belanja ${extraction.merchant}` : 'Belanja dari struk',
  )
  const [saving, setSaving] = useState(false)

  const itemsTotal = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows])
  const unmappedCount = rows.filter((row) => !row.categoryId).length

  const canSave =
    mode === 'single'
      ? Boolean(singleCategoryId) && singleAmount > 0
      : rows.length > 0 && unmappedCount === 0 && itemsTotal > 0

  const submit = async () => {
    setSaving(true)
    try {
      const payload =
        mode === 'single'
          ? {
              mode: 'single' as ScanMode,
              date: new Date(`${date}T12:00:00`),
              singleTransaction: {
                categoryId: singleCategoryId!,
                description,
                amount: singleAmount,
              },
            }
          : {
              mode: 'itemized' as ScanMode,
              date: new Date(`${date}T12:00:00`),
              itemTransactions: rows.map((row, index) => ({
                itemIndex: index,
                categoryId: row.categoryId!,
                description: row.name,
                amount: row.amount,
              })),
            }

      const ids = await save(
        payload,
        rows.map((row) => ({ name: row.name, categoryId: row.categoryId })),
      )
      onSaved(ids.length)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan transaksi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Receipt className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{extraction.merchant ?? 'Struk tanpa nama toko'}</p>
          <p className="text-xs text-muted-foreground">
            Total terdeteksi <MoneyDisplay value={extraction.total} className="font-medium" />
          </p>
        </div>
        <ConfidenceBadge confidence={totalConfidence} showLabel />
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/5 p-3">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <Tabs value={mode} onValueChange={(value) => setMode(value as ScanMode)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">1 Transaksi</TabsTrigger>
          <TabsTrigger value="itemized">Per Item ({rows.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="scan-date" className="text-xs">
            Tanggal
          </Label>
          <Input
            id="scan-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        {mode === 'single' && (
          <div className="space-y-1.5">
            <Label htmlFor="scan-amount" className="text-xs">
              Total
            </Label>
            <MoneyInput id="scan-amount" value={singleAmount} onChange={setSingleAmount} />
          </div>
        )}
      </div>

      {mode === 'single' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="scan-category" className="text-xs">
              Kategori
            </Label>
            <ItemCategorySelector
              value={singleCategoryId}
              categories={categories}
              onChange={setSingleCategoryId}
              ariaLabel="Kategori transaksi"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scan-description" className="text-xs">
              Keterangan
            </Label>
            <Input
              id="scan-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {rows.length > 0 && (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-xs font-medium">
                Item yang ditemukan ({rows.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {rows.map((row, index) => (
                  <li key={index} className="flex justify-between gap-3 text-xs">
                    <span className="truncate">{row.name}</span>
                    <span className="tabular shrink-0">{formatIDR(row.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 border-t pt-1 text-xs font-medium">
                  <span>Subtotal item</span>
                  <span className="tabular">{formatIDR(itemsTotal)}</span>
                </li>
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* The drawer body scrolls; a long receipt must not push the save button away. */}
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <li key={index} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(event) =>
                      setRows(
                        rows.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)),
                      )
                    }
                    className="h-8 flex-1 text-sm"
                    aria-label={`Nama item ${index + 1}`}
                  />
                  <ConfidenceBadge confidence={mappedItems[index]?.mappingConfidence ?? 0} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    aria-label={`Hapus item ${row.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <MoneyInput
                    value={row.amount}
                    onChange={(value) =>
                      setRows(rows.map((r, i) => (i === index ? { ...r, amount: value } : r)))
                    }
                    className="h-8"
                    aria-label={`Harga ${row.name}`}
                  />
                  <ItemCategorySelector
                    value={row.categoryId}
                    categories={categories}
                    onChange={(value) =>
                      setRows(rows.map((r, i) => (i === index ? { ...r, categoryId: value } : r)))
                    }
                    ariaLabel={`Kategori ${row.name}`}
                    className="h-8"
                  />
                </div>

                {mappedItems[index]?.mappingReason && (
                  <p className="text-xs text-muted-foreground">
                    {mappedItems[index].mappingReason}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => setRows([...rows, { name: '', amount: 0, categoryId: null }])}
          >
            <Plus className="size-3.5" aria-hidden />
            Tambah item manual
          </Button>

          <div className="flex items-center justify-between px-1 text-sm">
            <span className="text-muted-foreground">Total {rows.length} item</span>
            <MoneyDisplay value={itemsTotal} className="font-semibold" />
          </div>

          {unmappedCount > 0 && (
            <p className={cn('text-xs text-exceeded')}>
              {unmappedCount} item belum punya kategori.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => void discard()}
          disabled={saving}
          className="flex-1"
        >
          Buang
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!canSave || saving}
          className="flex-1 gap-2"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {mode === 'single' ? 'Simpan 1 transaksi' : `Simpan ${rows.length} transaksi`}
        </Button>
      </div>
    </div>
  )
}

function mostCommonCategory(ids: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const id of ids) {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? null
}
