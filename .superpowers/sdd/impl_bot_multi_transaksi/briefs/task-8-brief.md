## Task 8: Alur Tinjauan Editable

R6/R10. Loop yang menerima setiap perintah tinjauan, menerapkannya ke `DraftBatch`, dan menampilkan kartu terbaru.

**Files:**
- Create: `src/shared/bot/flow-review.ts`
- Test: `src/shared/bot/flow-review.test.ts`
- Modify: `src/shared/bot/core.ts` (dispatch ke `flow-review` saat pending bertipe `transaction_batch`)

**Interfaces:**
- Consumes: `parseReviewCommand` dari `./review-commands`; `batchToDTOs`, `renumber` dari `./draft`; `adminData` (`setPending`, `clearPending`, `findCategories`, `getMonthlyBudget`, `isBudgetClosedAdmin`, `createTransactionsBatch`, `rememberLastBatch`, `getUserTimezone`); `replies`
- Produces:
  - `handleReviewMessage(userId: string, batch: DraftBatch, msg: BotIncoming): Promise<BotReply>`
  - `startReview(userId: string, batch: DraftBatch): Promise<BotReply>` — dipakai Task 9

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/flow-review.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { BotIncoming, DraftBatch, DraftLine } from './types'

const setPending = vi.fn()
const clearPending = vi.fn()
const findCategories = vi.fn()
const getMonthlyBudget = vi.fn()
const isBudgetClosedAdmin = vi.fn()
const createTransactionsBatch = vi.fn()
const rememberLastBatch = vi.fn()
const getUserTimezone = vi.fn()

vi.mock('./admin-data', () => ({
  setPending: (...a: unknown[]) => setPending(...a),
  clearPending: (...a: unknown[]) => clearPending(...a),
  findCategories: (...a: unknown[]) => findCategories(...a),
  getMonthlyBudget: (...a: unknown[]) => getMonthlyBudget(...a),
  isBudgetClosedAdmin: (...a: unknown[]) => isBudgetClosedAdmin(...a),
  createTransactionsBatch: (...a: unknown[]) => createTransactionsBatch(...a),
  rememberLastBatch: (...a: unknown[]) => rememberLastBatch(...a),
  getUserTimezone: (...a: unknown[]) => getUserTimezone(...a),
}))

const { handleReviewMessage } = await import('./flow-review')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar,
    percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}

const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-transport', 'Transportasi', 'needs')]

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    n: 1, type: 'expense', amount: 35000, description: 'kopi',
    categoryId: 'c-food', categoryName: 'Makan',
    dateIso: new Date(Date.UTC(2026, 8, 6, 7, 32)).toISOString(),
    options: [
      { categoryId: 'c-food', name: 'Makan' },
      { categoryId: 'c-transport', name: 'Transportasi' },
    ],
    ...over,
  }
}

function batch(over: Partial<DraftBatch> = {}): DraftBatch {
  return {
    pendingKind: 'transaction_batch', source: 'receipt',
    lines: [line({ n: 1 }), line({ n: 2, amount: 24000, description: 'teh' })],
    mode: 'itemized', merchant: 'Indomaret', receiptTotal: 59000, warnings: [],
    ...over,
  }
}

const text = (t: string): BotIncoming => ({ platform: 'telegram', externalId: '1', kind: 'text', text: t })
const photo = (): BotIncoming => ({
  platform: 'telegram', externalId: '1', kind: 'image', imageBase64: 'x', mimeType: 'image/jpeg',
})

beforeEach(() => {
  vi.clearAllMocks()
  findCategories.mockResolvedValue(CATEGORIES)
  getMonthlyBudget.mockResolvedValue(null)
  isBudgetClosedAdmin.mockReturnValue(false)
  createTransactionsBatch.mockResolvedValue(['t1', 't2'])
  getUserTimezone.mockResolvedValue('Asia/Jakarta')
})

describe('handleReviewMessage — commit', () => {
  it('writes every line, remembers the batch for /undo, and clears the draft', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(createTransactionsBatch.mock.calls[0][1]).toHaveLength(2)
    expect(rememberLastBatch).toHaveBeenCalledWith('u1', ['t1', 't2'])
    expect(clearPending).toHaveBeenCalledWith('u1')
    expect(reply.text).toContain('2 transaksi tercatat')
  })

  it('writes exactly one transaction when the batch is in single mode', async () => {
    createTransactionsBatch.mockResolvedValue(['t1'])
    await handleReviewMessage('u1', batch({ mode: 'single' }), text('ok'))
    expect(createTransactionsBatch.mock.calls[0][1]).toHaveLength(1)
  })

  it('refuses to save while a line has no category, and keeps the draft alive', async () => {
    const b = batch({ lines: [line({ n: 1 }), line({ n: 2, categoryId: null, categoryName: null })] })
    const reply = await handleReviewMessage('u1', b, text('ok'))
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(clearPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('belum punya kategori')
  })

  it('refuses to save into a closed month', async () => {
    isBudgetClosedAdmin.mockReturnValue(true)
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('sudah ditutup')
  })
})

describe('handleReviewMessage — edits', () => {
  it('applies a category choice and re-renders the card', async () => {
    const b = batch({ lines: [line({ n: 1, categoryId: null, categoryName: null })] })
    const reply = await handleReviewMessage('u1', b, text('kat 1 2'))
    const saved = setPending.mock.calls[0][1] as DraftBatch
    expect(saved.lines[0].categoryId).toBe('c-transport')
    expect(reply.text).toContain('Tinjau')
  })

  it('applies an amount edit', async () => {
    await handleReviewMessage('u1', batch(), text('nom 1 40rb'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].amount).toBe(40000)
  })

  it('applies a description edit keeping the original casing', async () => {
    await handleReviewMessage('u1', batch(), text('ket 1 Kopi Susu'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].description).toBe('Kopi Susu')
  })

  it('applies a date edit', async () => {
    await handleReviewMessage('u1', batch(), text('tgl 1 2026-08-31'))
    expect((setPending.mock.calls[0][1] as DraftBatch).lines[0].dateIso.slice(0, 10)).toBe('2026-08-31')
  })

  it('re-scopes the options when the type changes, so income lines cannot take spend categories', async () => {
    findCategories.mockResolvedValue([...CATEGORIES, cat('c-salary', 'Gaji', 'income')])
    await handleReviewMessage('u1', batch(), text('tipe 1 masuk'))
    const saved = (setPending.mock.calls[0][1] as DraftBatch).lines[0]
    expect(saved.type).toBe('income')
    expect(saved.options.map((o) => o.categoryId)).toEqual(['c-salary'])
    expect(saved.categoryId).toBeNull()
  })

  it('removes a line and renumbers what is left', async () => {
    await handleReviewMessage('u1', batch(), text('hapus 1'))
    const saved = setPending.mock.calls[0][1] as DraftBatch
    expect(saved.lines).toHaveLength(1)
    expect(saved.lines[0].n).toBe(1)
    expect(saved.lines[0].amount).toBe(24000)
  })

  it('cancels the whole batch when the last line is removed', async () => {
    const reply = await handleReviewMessage('u1', batch({ lines: [line()] }), text('hapus 1'))
    expect(clearPending).toHaveBeenCalledWith('u1')
    expect(reply.text).toContain('Tidak ada baris tersisa')
  })

  it('toggles between merged and itemized without losing lines', async () => {
    await handleReviewMessage('u1', batch(), text('gabung'))
    const merged = setPending.mock.calls[0][1] as DraftBatch
    expect(merged.mode).toBe('single')
    expect(merged.lines).toHaveLength(2)
  })

  it('rejects an out-of-range line number and leaves the batch untouched', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('hapus 9'))
    expect(setPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('1-2')
  })
})

describe('handleReviewMessage — cancel, help, and non-commands', () => {
  it('cancels on "batal" and reports how many were dropped', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('batal'))
    expect(clearPending).toHaveBeenCalledWith('u1')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('2 transaksi')
  })

  it('shows the per-line edit menu for a focus tap', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('rv:edit:2'))
    expect(reply.text).toContain('Baris 2')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('answers bantuedit without touching the batch', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('bantuedit'))
    expect(reply.text).toContain('Perintah saat meninjau')
    expect(setPending).not.toHaveBeenCalled()
  })

  it('keeps the batch alive when the text is not a review command', async () => {
    const reply = await handleReviewMessage('u1', batch(), text('bensin 50rb'))
    expect(clearPending).not.toHaveBeenCalled()
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(reply.text).toContain('menunggu konfirmasi')
  })

  it('does not silently drop the batch when a new photo arrives', async () => {
    const reply = await handleReviewMessage('u1', batch(), photo())
    expect(clearPending).not.toHaveBeenCalled()
    expect(reply.text).toContain('menunggu konfirmasi')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/flow-review.test.ts`
Expected: FAIL — `Failed to resolve import "./flow-review"`.

- [ ] **Step 3: Implementasi `flow-review.ts`**

Buat `src/shared/bot/flow-review.ts`:

```ts
import type { Category } from '@/shared/types/domain'
import * as adminData from './admin-data'
import { batchToDTOs, renumber } from './draft'
import { replies } from './replies'
import { parseReviewCommand } from './review-commands'
import type { BotIncoming, BotReply, BotTxType, DraftBatch, DraftLine, ReviewCommand } from './types'

/**
 * The editable review loop. Every write the bot performs now passes through here, so
 * "confirm before recording" is a property of the system rather than of one code path.
 *
 * A draft is never dropped silently: only `batal` (or the 15-minute TTL) discards it.
 * The old flow abandoned a pending draft the moment any unrelated message arrived,
 * which quietly threw away a Gemini call the user had already waited for.
 */

const MAX_OPTIONS = 4

function eligibleCategories(type: BotTxType, categories: Category[]): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

function findLine(batch: DraftBatch, n: number): DraftLine | undefined {
  return batch.lines.find((l) => l.n === n)
}

function replaceLine(batch: DraftBatch, updated: DraftLine): DraftBatch {
  return { ...batch, lines: batch.lines.map((l) => (l.n === updated.n ? updated : l)) }
}

/** Changing a line's type invalidates its category: an income line may not sit in a
 *  spend category and vice versa. Options are re-scoped and the choice is cleared, so
 *  the user is asked again rather than left with a silently wrong pillar. */
function retypeLine(line: DraftLine, type: BotTxType, categories: Category[]): DraftLine {
  const eligible = eligibleCategories(type, categories)
  const stillValid = line.categoryId ? eligible.find((c) => c.id === line.categoryId) : undefined
  return {
    ...line,
    type,
    categoryId: stillValid?.id ?? null,
    categoryName: stillValid?.name ?? null,
    options: eligible.slice(0, MAX_OPTIONS).map((c) => ({ categoryId: c.id, name: c.name })),
  }
}

async function persistAndRender(userId: string, batch: DraftBatch): Promise<BotReply> {
  await adminData.setPending(userId, batch)
  const tz = await adminData.getUserTimezone(userId)
  return replies.batchReview(batch, tz)
}

/** Re-renders the card for the current draft without changing it. */
export async function startReview(userId: string, batch: DraftBatch): Promise<BotReply> {
  return persistAndRender(userId, batch)
}

async function commit(userId: string, batch: DraftBatch, categories: Category[]): Promise<BotReply> {
  const blocking = batch.lines.filter((l) => l.categoryId === null).map((l) => l.n)
  if (blocking.length > 0) return replies.reviewNeedsCategory(blocking)

  const dtos = batchToDTOs(batch, categories)
  if (dtos.length === 0) {
    await adminData.clearPending(userId)
    return replies.batchEmpty()
  }

  // Month lock is checked per distinct month the batch touches — a batch can straddle
  // a boundary once the user has edited dates.
  const months = new Map<string, Date>()
  for (const dto of dtos) {
    months.set(`${dto.date.getFullYear()}-${dto.date.getMonth() + 1}`, dto.date)
  }
  for (const date of months.values()) {
    const budget = await adminData.getMonthlyBudget(userId, date.getFullYear(), date.getMonth() + 1)
    if (adminData.isBudgetClosedAdmin(budget)) {
      return replies.monthClosed(date.getFullYear(), date.getMonth() + 1)
    }
  }

  const ids = await adminData.createTransactionsBatch(userId, dtos)
  await adminData.rememberLastBatch(userId, ids)
  await adminData.clearPending(userId)

  const tz = await adminData.getUserTimezone(userId)
  const savedLines = batch.mode === 'single' ? [{ ...batch.lines[0], n: 1, amount: dtos[0].amount, description: dtos[0].description ?? null }] : batch.lines
  const receiptStatus = batch.receipt ? 'saved' : batch.source === 'receipt' ? 'drive_not_linked' : 'none'
  return replies.batchSaved(savedLines, batch.mode, tz, receiptStatus)
}

async function applyCommand(
  userId: string,
  batch: DraftBatch,
  cmd: ReviewCommand,
  categories: Category[],
): Promise<BotReply> {
  const max = batch.lines.length

  switch (cmd.kind) {
    case 'save':
      return commit(userId, batch, categories)

    case 'cancel':
      await adminData.clearPending(userId)
      return replies.batchCancelled(batch.lines.length)

    case 'help':
      return replies.reviewHelp()

    case 'set_mode':
      return persistAndRender(userId, { ...batch, mode: cmd.mode })

    case 'focus': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      const tz = await adminData.getUserTimezone(userId)
      return replies.reviewLineFocus(line, tz)
    }

    case 'remove': {
      if (!findLine(batch, cmd.n)) return replies.reviewInvalidLine(cmd.n, max)
      const lines = renumber(batch.lines.filter((l) => l.n !== cmd.n))
      if (lines.length === 0) {
        await adminData.clearPending(userId)
        return replies.batchEmpty()
      }
      return persistAndRender(userId, { ...batch, lines })
    }

    case 'set_category': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      const option = line.options[cmd.option - 1]
      if (!option) return replies.reviewInvalidLine(cmd.option, line.options.length)
      return persistAndRender(
        userId,
        replaceLine(batch, { ...line, categoryId: option.categoryId, categoryName: option.name }),
      )
    }

    case 'set_amount': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, amount: cmd.amount }))
    }

    case 'set_description': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, description: cmd.text }))
    }

    case 'set_date': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, { ...line, dateIso: cmd.date.toISOString() }))
    }

    case 'set_type': {
      const line = findLine(batch, cmd.n)
      if (!line) return replies.reviewInvalidLine(cmd.n, max)
      return persistAndRender(userId, replaceLine(batch, retypeLine(line, cmd.type, categories)))
    }

    default:
      return replies.reviewUnknownCommand(batch.lines.length)
  }
}

export async function handleReviewMessage(
  userId: string,
  batch: DraftBatch,
  msg: BotIncoming,
): Promise<BotReply> {
  // A photo mid-review is almost always the *next* receipt, not a correction. Saying so
  // beats silently discarding the batch the user is halfway through checking.
  if (msg.kind !== 'text') return replies.busyReviewing(batch.lines.length)

  const cmd = parseReviewCommand(msg.text, new Date())
  if (cmd.kind === 'none') return replies.reviewUnknownCommand(batch.lines.length)

  const categories = await adminData.findCategories(userId)
  return applyCommand(userId, batch, cmd, categories)
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/flow-review.test.ts`
Expected: PASS (18 test).

- [ ] **Step 5: Sambungkan ke `core.ts`**

Di `src/shared/bot/core.ts`, ganti blok pending di `handleIncoming`:

```ts
  // A pending draft takes priority over everything else. A `transaction_batch` goes to
  // the review loop; the goal-contribution flow keeps its own two-step handler.
  const pending = await adminData.getPending(userId)
  if (pending) {
    if (pending.pendingKind === 'transaction_batch') {
      // Read commands still work mid-review — answering "/ringkasan" should not cost
      // the user their draft (see flow-review's no-silent-drop rule).
      if (msg.kind === 'text') {
        const readCommand = matchReadCommand(msg.text.trim())
        if (readCommand && readCommand !== 'cancel_pending') {
          const answer = await handleReadCommand(userId, readCommand)
          return {
            ...answer,
            text: `${answer.text}\n\n<i>ℹ️ Masih ada ${pending.lines.length} transaksi menunggu — balas <code>ok</code> untuk simpan, <code>batal</code> untuk buang.</i>`,
          }
        }
        if (readCommand === 'cancel_pending') {
          await adminData.clearPending(userId)
          return replies.batchCancelled(pending.lines.length)
        }
      }
      return handleReviewMessage(userId, pending, msg)
    }
    return handlePendingReply(userId, pending, msg)
  }
```

Tambahkan impor `import { handleReviewMessage } from './flow-review'`, dan sempitkan tipe `handlePendingReply` menjadi hanya `GoalContributionDraft`.

- [ ] **Step 6: Jalankan seluruh test bot**

Run: `npx vitest run src/shared/bot src/app/api/bot && npx tsc --noEmit`
Expected: PASS. Test lama di `core.test.ts` yang menguji alur `category_confirm` akan gagal — hapus test-test itu; perilakunya digantikan `flow-review.test.ts`, dan draft `category_confirm` tidak pernah lagi ditulis (Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/shared/bot/flow-review.ts src/shared/bot/flow-review.test.ts src/shared/bot/core.ts src/shared/bot/core.test.ts
git commit -m "feat(bot): editable review loop before anything is written

Every bot write now goes through one confirmation card, so 'confirm before recording'
is a property of the system rather than of one code path.

A draft is never dropped silently. Read commands are answered mid-review with a
one-line reminder, unknown text re-shows the hint, and a new photo is refused — only
batal (or the 15-minute TTL) discards. The old flow threw away a Gemini call the user
had already waited for the moment any unrelated message arrived.

Changing a line's type re-scopes its categories and clears the choice: an income line
must never inherit a spend category's pillar."
```

---

