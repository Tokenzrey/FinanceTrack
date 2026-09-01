import type { Category, Transaction } from '@/shared/types/domain'
import { PILLAR_LABELS } from '@/shared/types/domain'

/**
 * CSV that opens cleanly in Google Sheets and Excel.
 *
 * Amounts are written as plain integers ("1500000"), never formatted with the Indonesian
 * thousand separator — "1.500.000" is read as text, or worse as 1.5, and the whole
 * column stops summing. Formatting is the spreadsheet's job, not the export's.
 */

const HEADERS = [
  'Tanggal',
  'Jenis',
  'Pilar',
  'Kategori',
  'Item',
  'Keterangan',
  'Toko',
  'Metode',
  'Tag',
  'Perasaan',
  'Jumlah',
] as const

const TYPE_LABEL = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
} as const

const METHOD_LABEL = {
  cash: 'Tunai',
  debit: 'Kartu Debit',
  credit: 'Kartu Kredit',
  transfer: 'Transfer',
  ewallet: 'E-Wallet',
  qris: 'QRIS',
} as const

const MOOD_LABEL = { happy: 'Perlu', neutral: 'Oke', regret: 'Menyesal' } as const

/**
 * RFC-4180 quoting. A field is quoted when it contains a comma, quote, or newline;
 * embedded quotes are doubled. A merchant called `Toko "Maju", Jaya` must survive.
 */
export function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function transactionsToCsv(
  transactions: Transaction[],
  categories: Category[],
  categoryItemNames: Record<string, string> = {},
): string {
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const rows = transactions.map((tx) => {
    const category = categoryById.get(tx.categoryId)
    return [
      isoDay(tx.date.toDate()),
      TYPE_LABEL[tx.type],
      PILLAR_LABELS[tx.pillar],
      category?.name ?? '',
      tx.categoryItemId ? (categoryItemNames[tx.categoryItemId] ?? '') : '',
      tx.description ?? '',
      tx.location ?? '',
      tx.paymentMethod ? METHOD_LABEL[tx.paymentMethod] : '',
      tx.tags.join(' '),
      tx.mood ? MOOD_LABEL[tx.mood] : '',
      String(Math.round(tx.amount)),
    ].map((field) => escapeCsvField(field))
  })

  return [HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\r\n')
}

/** Byte-order mark. Without it Excel reads UTF-8 as ANSI and mangles "Keuangan Rumah". */
const BOM = '﻿'

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
