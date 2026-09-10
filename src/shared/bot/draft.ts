import type { Category, Pillar, TransactionItem } from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'
import type { MappedReceiptItem, ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import { reconcileToTotal } from '@/shared/lib/transaction-items'
import { parseAmount } from './parse-amount'
import type { BotTxType, DraftBatch, DraftLine, ParsedLine } from './types'

/**
 * Pure model behind the review card. Nothing here touches Firestore, Gemini, or the
 * system clock — `now` is always injected — so every rule below is testable on its own.
 */

/** Firestore batch writes cap at 500; 20 also keeps the review card readable in chat. */
export const MAX_DRAFT_LINES = 20

/** How many alternate categories a line offers for the `kat <n> <k>` command. */
const MAX_OPTIONS = 4

export function renumber(lines: DraftLine[]): DraftLine[] {
  return lines.map((line, index) => ({ ...line, n: index + 1 }))
}

/** Income lines may only use income categories and spend lines may never use them —
 *  the same code-level backstop `core.ts` already applies to the model's suggestions. */
function categoriesFor(type: BotTxType, categories: Category[]): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

function buildOptions(
  candidateIds: string[],
  eligible: Category[],
): { categoryId: string; name: string }[] {
  const byId = new Map(eligible.map((c) => [c.id, c]))
  const picked = candidateIds.filter((id) => byId.has(id)).slice(0, MAX_OPTIONS)
  // Always offer something: a dead end with no options leaves the user unable to
  // finish the review at all.
  const filler = eligible.filter((c) => !picked.includes(c.id)).slice(0, MAX_OPTIONS - picked.length)
  return [...picked.map((id) => byId.get(id)!), ...filler].map((c) => ({ categoryId: c.id, name: c.name }))
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function buildLinesFromParsed(parsed: ParsedLine[], categories: Category[], now: Date): DraftLine[] {
  const lines: DraftLine[] = []

  for (const item of parsed.slice(0, MAX_DRAFT_LINES)) {
    // The model returns the literal substring it believes carries the nominal; the
    // number itself is always produced here, by the deterministic parser.
    const amount = parseAmount(item.amountText)
    if (amount === null || amount <= 0) continue

    const eligible = categoriesFor(item.type, categories)
    const options = buildOptions(item.categoryCandidates, eligible)
    const top = item.categoryCandidates.find((id) => eligible.some((c) => c.id === id))
    const chosen = top ? eligible.find((c) => c.id === top)! : null

    lines.push({
      n: 0,
      type: item.type,
      amount,
      description: item.description?.trim() || null,
      categoryId: chosen?.id ?? null,
      categoryName: chosen?.name ?? null,
      dateIso: shiftDays(now, item.dateOffset || 0).toISOString(),
      confidence: item.confidence,
      options,
    })
  }

  return renumber(lines)
}

/** Receipt dates arrive as "yyyy-MM-dd" with no clock; the current time is kept so
 *  the stamp in the reply still reads as a moment, not midnight. */
function receiptDate(isoDay: string | null, now: Date): Date {
  if (!isoDay || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return now
  const [y, m, d] = isoDay.split('-').map(Number)
  const dated = new Date(now.getTime())
  dated.setUTCFullYear(y, m - 1, d)
  if (Number.isNaN(dated.getTime())) return now
  // The regex accepts "2026-13-01" / "2026-02-30"; `setUTCFullYear` then rolls over to a
  // real-but-wrong date. Reject it the same way `review-commands.ts` `withClockOf` does.
  if (dated.getUTCFullYear() !== y || dated.getUTCMonth() !== m - 1 || dated.getUTCDate() !== d) return now
  return dated
}

export function buildLinesFromReceipt(
  result: ReceiptScanResult,
  categories: Category[],
  now: Date,
): DraftLine[] {
  const eligible = categoriesFor('expense', categories)
  const date = receiptDate(result.extraction.date, now).toISOString()

  const lines = result.mappedItems
    .slice(0, MAX_DRAFT_LINES)
    .filter((item: MappedReceiptItem) => item.totalPrice > 0)
    .map<DraftLine>((item) => {
      const chosen = item.suggestedCategoryId
        ? (eligible.find((c) => c.id === item.suggestedCategoryId) ?? null)
        : null
      return {
        n: 0,
        type: 'expense',
        amount: Math.round(item.totalPrice),
        description: item.name?.trim() || null,
        categoryId: chosen?.id ?? null,
        categoryName: chosen?.name ?? null,
        dateIso: date,
        // A mapped line carries its own category-mapping confidence (0 when the model
        // left it unmapped); the whole-receipt read confidence is the fallback shape.
        confidence: item.mappingConfidence || result.totalConfidence,
        options: buildOptions(item.suggestedCategoryId ? [item.suggestedCategoryId] : [], eligible),
        quantity: item.quantity ?? null,
      }
    })

  return renumber(lines)
}

export function batchTotals(batch: DraftBatch): {
  expense: number
  income: number
  transfer: number
  net: number
} {
  const sum = (type: BotTxType) =>
    batch.lines.filter((l) => l.type === type).reduce((total, l) => total + l.amount, 0)
  const expense = sum('expense')
  const income = sum('income')
  const transfer = sum('transfer')
  return { expense, income, transfer, net: income - expense }
}

/** What a collapsed `single` batch actually records: the model's printed receipt total
 *  when it read one (tax/service included), else the sum of the line items. */
export function collapsedAmount(batch: DraftBatch): number {
  if (batch.receiptTotal !== null && batch.receiptTotal > 0) return batch.receiptTotal
  return batch.lines.reduce((total, l) => total + l.amount, 0)
}

/** The one line a `mode: 'single'` batch commits as. Category follows the highest-value
 *  line, since that is what the combined transaction mostly *is*. */
export function collapseToSingle(batch: DraftBatch): DraftLine {
  // Every current caller pre-checks `lines.length > 0`; make a future one that forgets
  // fail loudly rather than spread `undefined` into a malformed line.
  if (batch.lines.length === 0) throw new Error('collapseToSingle: empty batch')
  const amount = collapsedAmount(batch)
  const heaviest = [...batch.lines].sort((a, b) => b.amount - a.amount)[0]
  const description =
    batch.merchant?.trim() ||
    batch.lines
      .map((l) => l.description)
      .filter((d): d is string => Boolean(d))
      .join(', ') ||
    null

  return {
    ...heaviest,
    n: 1,
    amount,
    description,
    confidence: heaviest.confidence,
    quantity: null,
  }
}

function pillarOf(line: DraftLine, categories: Map<string, Pillar>): Pillar | null {
  return line.categoryId ? (categories.get(line.categoryId) ?? null) : null
}

/**
 * The write shape. `type` comes from the line (so `transfer` survives), while `pillar`
 * still follows the category — the app's existing rule. A line with no category is
 * dropped rather than guessed at: it could never have been written anyway.
 */
export function batchToDTOs(batch: DraftBatch, categories: Category[] = []): CreateTransactionDTO[] {
  const pillars = new Map(categories.map((c) => [c.id, c.pillar]))
  const collapsing = batch.mode === 'single' && batch.lines.length > 0
  // `collapseToSingle` already resolves the amount to the printed receipt total when
  // there is one (tax/service the line items miss), else the line sum.
  const collapsed = collapsing ? collapseToSingle(batch) : null
  const source = collapsed ? [collapsed] : batch.lines

  // The lines become `items[]`, scaled so their sum matches the amount written.
  const items: TransactionItem[] | undefined = collapsed
    ? reconcileToTotal(
        batch.lines.map((l) => ({
          name: l.description ?? 'Item',
          qty: Math.max(1, Math.floor(l.quantity ?? 1)),
          price: Math.max(0, Math.round(l.amount)),
        })),
        collapsed.amount,
      )
    : undefined

  return source
    .filter((line) => line.categoryId !== null && line.amount > 0)
    .map((line) => ({
      date: new Date(line.dateIso),
      type: line.type,
      pillar: pillarOf(line, pillars) ?? inferPillar(line.type),
      categoryId: line.categoryId as string,
      amount: line.amount,
      title: collapsed ? (batch.merchant?.trim() || undefined) : undefined,
      description: line.description ?? undefined,
      items: items && items.length > 0 ? items : undefined,
      tax: collapsed ? batch.tax : undefined,
      discount: collapsed ? batch.discount : undefined,
      tags: ['bot'],
      gDriveFileId: batch.receipt?.gDriveFileId,
      gDriveWebViewLink: batch.receipt?.gDriveWebViewLink,
    }))
}

/** Only reached when the caller passed no category list (the pure-unit test path).
 *  Never a silent guess in production — `flow-review.ts` always passes categories. */
function inferPillar(type: BotTxType): Pillar {
  return type === 'income' ? 'income' : 'needs'
}
