'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Label } from '@/shared/components/ui/label'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { parseCsv, type CsvDateFormat } from '@/shared/lib/csv'
import { formatDay } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  buildCsvPreview,
  importTransactionsCsv,
  type CsvColumnMapping,
  type ImportCsvResult,
} from '@/shared/use-cases/transactions/ImportTransactionsCsv.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import type { Category } from '@/shared/types/domain'

type Step = 'upload' | 'mapping' | 'preview' | 'done'

const DATE_FORMATS: { value: CsvDateFormat; label: string }[] = [
  { value: 'dmy', label: 'HH/BB/TTTT (31/12/2025)' },
  { value: 'ymd', label: 'TTTT-BB-HH (2025-12-31)' },
  { value: 'mdy', label: 'BB/HH/TTTT (12/31/2025)' },
]

const emptyMapping = (defaultCategoryId: string): CsvColumnMapping => ({
  date: null,
  amount: null,
  description: null,
  category: null,
  dateFormat: 'dmy',
  defaultCategoryId,
})

/**
 * Upload → map columns → preview & validate → import. No column names are assumed —
 * exports from a bank, e-wallet, or another app all name their columns differently, so
 * the user maps meaning to header explicitly rather than the wizard guessing wrong and
 * silently misfiling amounts.
 */
export function ImportCsvWizard({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<CsvColumnMapping>(() =>
    emptyMapping(categories.find((c) => c.pillar !== 'income' && c.isActive)?.id ?? ''),
  )
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCsvResult | null>(null)

  // `categories` is very likely still empty at mount (the page's own `loadAll()` hasn't
  // resolved yet, since this wizard renders unconditionally alongside the page, not
  // only when opened) — backfill the default once real categories exist, but only if
  // the user hasn't already chosen one themselves.
  useEffect(() => {
    if (mapping.defaultCategoryId) return
    const fallback = categories.find((c) => c.pillar !== 'income' && c.isActive)?.id
    if (fallback) setMapping((m) => ({ ...m, defaultCategoryId: fallback }))
  }, [categories, mapping.defaultCategoryId])

  const preview = useMemo(
    () =>
      step === 'preview' || step === 'done'
        ? buildCsvPreview(headers, rows, mapping, categories)
        : [],
    [step, headers, rows, mapping, categories],
  )
  const validCount = preview.filter((r) => !r.error).length

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const loadText = (text: string) => {
    const parsed = parseCsv(text)
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error('File CSV kosong atau tidak terbaca.')
      return
    }
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    // Best-effort auto-guess by header name — saves a step for the common case, never
    // blocks anything since every field stays editable on the mapping screen.
    const guess = (needles: string[]) =>
      parsed.headers.find((h) => needles.some((n) => h.toLowerCase().includes(n))) ?? null
    setMapping((m) => ({
      ...m,
      date: guess(['tanggal', 'date', 'tgl']),
      amount: guess(['jumlah', 'nominal', 'amount', 'debit', 'kredit', 'credit']),
      description: guess(['keterangan', 'deskripsi', 'description', 'note', 'catatan']),
      category: guess(['kategori', 'category']),
    }))
    setStep('mapping')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => loadText(String(reader.result ?? ''))
    reader.onerror = () => toast.error('Gagal membaca file.')
    reader.readAsText(file, 'utf-8')
  }

  const runImport = async () => {
    if (!userId) return
    setImporting(true)
    try {
      const outcome = await importTransactionsCsv(userId, preview, categories)
      setResult(outcome)
      setStep('done')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengimpor CSV.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor transaksi dari CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Unggah file CSV dari mutasi rekening, e-wallet, atau ekspor aplikasi lain. Kolom
              apa pun boleh — artinya dipetakan di langkah berikutnya.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Upload className="size-6" aria-hidden />
              Klik untuk pilih file .csv
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MappingField
                label="Kolom tanggal *"
                value={mapping.date}
                headers={headers}
                onChange={(v) => setMapping((m) => ({ ...m, date: v }))}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Format tanggal</Label>
                <select
                  value={mapping.dateFormat}
                  onChange={(event) =>
                    setMapping((m) => ({ ...m, dateFormat: event.target.value as CsvDateFormat }))
                  }
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <MappingField
                label="Kolom jumlah *"
                value={mapping.amount}
                headers={headers}
                onChange={(v) => setMapping((m) => ({ ...m, amount: v }))}
              />
              <MappingField
                label="Kolom keterangan"
                value={mapping.description}
                headers={headers}
                onChange={(v) => setMapping((m) => ({ ...m, description: v }))}
              />
              <MappingField
                label="Kolom kategori"
                value={mapping.category}
                headers={headers}
                onChange={(v) => setMapping((m) => ({ ...m, category: v }))}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori default</Label>
                <select
                  value={mapping.defaultCategoryId}
                  onChange={(event) =>
                    setMapping((m) => ({ ...m, defaultCategoryId: event.target.value }))
                  }
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                >
                  <option value="">— tidak ada —</option>
                  {categories
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Dipakai kalau teks kategori di CSV tidak cocok kategori manapun.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
              {rows.length} baris terbaca dari file.
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset}>
                Ganti file
              </Button>
              <Button disabled={!mapping.date || !mapping.amount} onClick={() => setStep('preview')}>
                Lihat pratinjau
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge>{validCount} valid</Badge>
              {preview.length - validCount > 0 && (
                <Badge variant="destructive">{preview.length - validCount} bermasalah</Badge>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2 text-left">Tanggal</th>
                    <th className="p-2 text-right">Jumlah</th>
                    <th className="p-2 text-left">Keterangan</th>
                    <th className="p-2 text-left">Kategori</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={cn('border-t', row.error && 'bg-destructive/5')}>
                      <td className="p-2 whitespace-nowrap">
                        {row.date ? formatDay(row.date) : '—'}
                      </td>
                      <td className="tabular p-2 text-right">
                        {row.amount !== null ? <MoneyDisplay value={row.amount} /> : '—'}
                      </td>
                      <td className="max-w-[160px] truncate p-2">{row.description || '—'}</td>
                      <td className="max-w-[120px] truncate p-2">{row.categoryName || '—'}</td>
                      <td className="p-2">
                        {row.error ? (
                          <span className="text-destructive">{row.error}</span>
                        ) : (
                          <span className="text-safe">Siap</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('mapping')}>
                Kembali
              </Button>
              <Button
                disabled={validCount === 0 || importing}
                onClick={() => void runImport()}
                className="gap-2"
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                Impor {validCount} transaksi
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4 text-center">
            <FileUp className="mx-auto size-10 text-safe" aria-hidden />
            <p className="text-sm">
              <strong>{result.created}</strong> transaksi berhasil diimpor.
              {result.skippedClosedMonth > 0 &&
                ` ${result.skippedClosedMonth} dilewati karena bulan sudah ditutup.`}
              {result.skippedInvalid > 0 &&
                ` ${result.skippedInvalid} dilewati karena datanya bermasalah.`}
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Selesai
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MappingField({
  label,
  value,
  headers,
  onChange,
}: {
  label: string
  value: string | null
  headers: string[]
  onChange: (value: string | null) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
      >
        <option value="">— tidak dipetakan —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  )
}
