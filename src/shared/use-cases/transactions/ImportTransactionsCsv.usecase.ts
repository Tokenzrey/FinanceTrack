import { repositories } from '@/shared/repositories'
import { isMonthClosed } from '@/shared/lib/month-lock'
import { parseCsvAmount, parseCsvDate, type CsvDateFormat } from '@/shared/lib/csv'
import type { Category } from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'

export interface CsvColumnMapping {
  date: string | null
  amount: string | null
  description: string | null
  category: string | null
  dateFormat: CsvDateFormat
  /** Used when a row's category text doesn't match any category name, or no category
   *  column was mapped at all. Empty string means "no fallback" — such rows error out. */
  defaultCategoryId: string
}

export interface CsvPreviewRow {
  raw: string[]
  date: Date | null
  amount: number | null
  description: string
  categoryId: string | null
  categoryName: string
  error: string | null
}

/**
 * Turns raw CSV rows into typed, validated preview rows using the chosen column
 * mapping — both the wizard's preview table and the final import walk this same shape,
 * so what the user reviews is exactly what gets written.
 *
 * The transaction's `type`/`pillar` are never read from the CSV: they always follow
 * the resolved category, the same rule `AddTransaction.usecase` already enforces for
 * manual entry — a category can never end up filed under the wrong pillar.
 */
export function buildCsvPreview(
  headers: string[],
  rows: string[][],
  mapping: CsvColumnMapping,
  categories: Category[],
): CsvPreviewRow[] {
  const dateIdx = mapping.date ? headers.indexOf(mapping.date) : -1
  const amountIdx = mapping.amount ? headers.indexOf(mapping.amount) : -1
  const descIdx = mapping.description ? headers.indexOf(mapping.description) : -1
  const catIdx = mapping.category ? headers.indexOf(mapping.category) : -1

  const byName = new Map(
    categories.filter((c) => c.isActive).map((c) => [c.name.trim().toLowerCase(), c]),
  )
  const defaultCategory = categories.find((c) => c.id === mapping.defaultCategoryId) ?? null

  return rows.map((row) => {
    const date = dateIdx >= 0 ? parseCsvDate(row[dateIdx] ?? '', mapping.dateFormat) : null
    const rawAmount = amountIdx >= 0 ? parseCsvAmount(row[amountIdx] ?? '') : null
    const description = descIdx >= 0 ? (row[descIdx] ?? '').trim() : ''
    const categoryText = catIdx >= 0 ? (row[catIdx] ?? '').trim() : ''
    const matched = categoryText ? (byName.get(categoryText.toLowerCase()) ?? null) : null
    const category = matched ?? defaultCategory

    let error: string | null = null
    if (!date) error = 'Tanggal tidak terbaca'
    else if (rawAmount === null || rawAmount === 0) error = 'Jumlah tidak terbaca'
    else if (!category) error = 'Kategori tidak cocok dan tidak ada default'

    return {
      raw: row,
      date,
      amount: rawAmount !== null ? Math.abs(rawAmount) : null,
      description,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? categoryText,
      error,
    }
  })
}

export interface ImportCsvResult {
  created: number
  skippedInvalid: number
  skippedClosedMonth: number
}

/**
 * Imports the previewed rows. A row landing in a closed month is skipped and counted,
 * not failed — the same "skip, don't block the whole batch" rule recurring-transaction
 * generation already follows, for the same reason: one locked month should not stop
 * every other row from importing.
 */
export async function importTransactionsCsv(
  userId: string,
  previewRows: CsvPreviewRow[],
  categories: Category[],
): Promise<ImportCsvResult> {
  const valid = previewRows.filter(
    (r): r is CsvPreviewRow & { date: Date; amount: number; categoryId: string } =>
      !r.error && r.date !== null && r.amount !== null && r.categoryId !== null,
  )
  const skippedInvalid = previewRows.length - valid.length
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const drafts: CreateTransactionDTO[] = []
  let skippedClosedMonth = 0

  // Dedupe the month-closed check — an import batch usually spans only a handful of
  // distinct months, no need to re-query Firestore once per row.
  const closedCache = new Map<string, boolean>()
  for (const row of valid) {
    const key = `${row.date.getFullYear()}-${row.date.getMonth()}`
    if (!closedCache.has(key)) closedCache.set(key, await isMonthClosed(userId, row.date))
    if (closedCache.get(key)) {
      skippedClosedMonth += 1
      continue
    }

    const category = categoryById.get(row.categoryId)
    if (!category) continue // unreachable — categoryId always comes from `categories`

    drafts.push({
      date: row.date,
      type: category.pillar === 'income' ? 'income' : 'expense',
      pillar: category.pillar,
      categoryId: row.categoryId,
      amount: row.amount,
      description: row.description || undefined,
      tags: ['impor-csv'],
    })
  }

  if (drafts.length > 0) await repositories.transactions.bulkCreate(userId, drafts)

  return { created: drafts.length, skippedInvalid, skippedClosedMonth }
}
