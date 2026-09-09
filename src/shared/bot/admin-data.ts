import { randomInt } from 'node:crypto'
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/shared/lib/firebase-admin'
import { liquidAssets } from '@/shared/lib/analytics'
import type {
  Asset,
  Category,
  Liability,
  MonthlyBudget,
  RecurringRule,
  SavingsGoal,
  Transaction,
} from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'
import type { FinancialContext } from '@/shared/use-cases/wishlist/CalculateAffordability.usecase'
import type { Wishlist } from '@/shared/types/wishlist.types'
import { buildMonthlySummary } from '@/shared/lib/budget-math'
import { dayKeyInTz } from '@/shared/lib/format'
import { sanitizeItems } from '@/shared/lib/transaction-items'
import { DEFAULT_PILLAR_CONFIG } from '@/shared/types/domain'
import type { ModelHealth } from '@/shared/lib/gemini-router'
import type { CategoryHint, ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import { DEFAULT_BOT_PREFS } from './types'
import type { BotPlatform, BotPrefs, DraftBatch, ParsedLine } from './types'

/**
 * The one module in the bot subsystem that talks to Firestore. Everything here reads
 * or writes via the Admin SDK (see `firebase-admin.ts` for why) — nothing in
 * `core.ts`, the parsers, or the webhook adapters touches Firestore directly.
 *
 * This also owns the two root collections (`bot_links`, `bot_link_codes`) that don't
 * fit the rest of the app's `users/{uid}/...` scoping, since they exist specifically
 * to answer "which user does this external chat belong to" — the one lookup
 * direction the per-user tree can't serve.
 */

const LINK_CODE_TTL_MS = 15 * 60 * 1000
const PENDING_TTL_MS = 15 * 60 * 1000

function linkDocId(platform: BotPlatform, externalId: string): string {
  return `${platform}_${externalId}`
}

/** Firestore rejects `undefined` field values — this app's client repositories strip
 *  them the same way (see `paths.ts`); duplicated here rather than imported so this
 *  module stays fully independent of the client Firestore SDK. */
export function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>
}

// ─── Account linking ────────────────────────────────────────────

export interface BotLink {
  userId: string
  platform: BotPlatform
  externalId: string
  displayName: string | null
  linkedAt: Timestamp
}

export async function findLinkByExternalId(
  platform: BotPlatform,
  externalId: string,
): Promise<BotLink | null> {
  const snap = await getAdminDb().collection('bot_links').doc(linkDocId(platform, externalId)).get()
  return snap.exists ? (snap.data() as BotLink) : null
}

/**
 * Reverse of `findLinkByExternalId`: which external chats a user is linked to. The
 * cron send path (`outbound.ts`) needs this direction — user → link(s) — to push a
 * reminder or digest. Doc ids are `${platform}_${externalId}`; split on the FIRST
 * `_` only so an external id that itself contains `_` still round-trips.
 */
export async function getLinksForUser(
  userId: string,
): Promise<Array<{ platform: 'whatsapp' | 'telegram'; externalId: string }>> {
  const snap = await getAdminDb().collection('bot_links').where('userId', '==', userId).get()
  return snap.docs.map((d) => {
    const i = d.id.indexOf('_')
    return {
      platform: d.id.slice(0, i) as 'whatsapp' | 'telegram',
      externalId: d.id.slice(i + 1),
    }
  })
}

/** Random, URL-safe, human-typeable — excludes visually ambiguous characters
 *  (0/O, 1/I/L) since the user has to retype this by hand into a chat. `randomInt` is a
 *  CSPRNG: a guessable code links a stranger's chat to this account. */
function randomLinkCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[randomInt(0, alphabet.length)]
  }
  return code
}

export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const db = getAdminDb()
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)

  // `.create()` (not `.set()`): a code collision must never silently overwrite another
  // user's live code — that user would then link to this account. Try fresh codes until
  // one is unclaimed.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomLinkCode()
    try {
      await db.collection('bot_link_codes').doc(code).create({
        userId,
        expiresAt: Timestamp.fromDate(expiresAt),
        usedAt: null,
      })
      return { code, expiresAt }
    } catch (err) {
      // gRPC ALREADY_EXISTS = 6 → this code is taken; pick another.
      if ((err as { code?: number }).code === 6) continue
      throw err
    }
  }
  throw new Error('createLinkCode: could not allocate an unused code after 5 attempts')
}

export type ConsumeLinkCodeResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'not_found' | 'expired' | 'used' }

/**
 * Consumes a link code and creates the link, inside one Firestore transaction — two
 * chats can never redeem the same code, and a code can never end up "half used" if a
 * write fails partway through.
 */
export async function consumeLinkCode(
  rawCode: string,
  platform: BotPlatform,
  externalId: string,
  displayName: string | null,
): Promise<ConsumeLinkCodeResult> {
  const db = getAdminDb()
  const code = rawCode.trim().toUpperCase()
  const codeRef = db.collection('bot_link_codes').doc(code)

  return db.runTransaction(async (tx): Promise<ConsumeLinkCodeResult> => {
    const snap = await tx.get(codeRef)
    if (!snap.exists) return { ok: false, error: 'not_found' }

    const data = snap.data() as { userId: string; expiresAt: Timestamp; usedAt: Timestamp | null }
    if (data.usedAt) return { ok: false, error: 'used' }
    if (data.expiresAt.toMillis() < Date.now()) return { ok: false, error: 'expired' }

    tx.update(codeRef, { usedAt: FieldValue.serverTimestamp() })

    const linkRef = db.collection('bot_links').doc(linkDocId(platform, externalId))
    tx.set(linkRef, {
      userId: data.userId,
      platform,
      externalId,
      displayName,
      linkedAt: FieldValue.serverTimestamp(),
    })

    // Client-readable mirror so Settings can show link status without reaching the
    // root collections directly (those are Admin-SDK-only — see firestore.rules).
    const mirrorRef = db.doc(`users/${data.userId}/meta/botLinks`)
    tx.set(
      mirrorRef,
      {
        [platform]: { externalId, displayName, linkedAt: FieldValue.serverTimestamp() },
      },
      { merge: true },
    )

    return { ok: true, userId: data.userId }
  })
}

// ─── Inbound message de-duplication ────────────────────────────
//
// GOWA's webhook client has a hardcoded 10s timeout and retries a failed delivery up
// to 5 times; Telegram redelivers on any non-2xx too. The bot pipeline (Gemini vision
// on a receipt photo especially) routinely runs longer than 10s, so without this
// guard a single photo gets processed 5× — 5 Gemini calls, 5 Drive uploads, 5
// transactions. `claimInboundMessage` claims a message id atomically (`.create()`
// fails if the doc already exists) so exactly one delivery does the work.

const PROCESSED_MSG_TTL_MS = 24 * 60 * 60 * 1000

/** Returns true if THIS call claimed the message (caller should process it), false if
 *  another delivery already claimed it (caller should skip). */
export async function claimInboundMessage(platform: BotPlatform, messageId: string): Promise<boolean> {
  if (!messageId) return true
  const ref = getAdminDb().collection('bot_processed_messages').doc(`${platform}_${messageId}`)
  try {
    await ref.create({
      platform,
      messageId,
      claimedAt: FieldValue.serverTimestamp(),
      // ponytail: TTL enforced by a Firestore native TTL policy on this field (set in
      // console/gcloud), not app code — nothing here reaps old claim docs.
      expiresAt: Timestamp.fromMillis(Date.now() + PROCESSED_MSG_TTL_MS),
    })
    return true
  } catch (err) {
    // gRPC ALREADY_EXISTS = 6 → a concurrent or earlier delivery owns this message.
    if ((err as { code?: number }).code === 6) return false
    throw err
  }
}

export async function deleteLink(userId: string, platform: BotPlatform): Promise<void> {
  const db = getAdminDb()
  const mirrorRef = db.doc(`users/${userId}/meta/botLinks`)
  const mirrorSnap = await mirrorRef.get()
  const entry = mirrorSnap.data()?.[platform] as { externalId: string } | undefined

  const batch = db.batch()
  if (entry?.externalId) {
    batch.delete(db.collection('bot_links').doc(linkDocId(platform, entry.externalId)))
  }
  batch.set(mirrorRef, { [platform]: FieldValue.delete() }, { merge: true })
  await batch.commit()
}

// ─── Pending draft (transaction-batch review, goal contribution) ───
//
// Two unrelated multi-step flows share one `meta/botPending` doc, so at most one can
// be in flight per user at a time — starting a new one abandons whichever was already
// there. `pendingKind` tells the caller which flow a stored draft belongs to.

interface GoalContributionDraft {
  pendingKind: 'goal_contribution'
  /** Candidate goals offered in step 1, in display order — `step: 'pick_goal'`
   *  interprets a numeric reply as a 1-based index into this list. */
  options: { goalId: string; name: string }[]
  step: 'pick_goal' | 'enter_amount'
  goalId?: string
  goalName?: string
}

export type BotPendingDraft = (GoalContributionDraft | DraftBatch) & {
  expiresAt: Timestamp
}

function pendingRef(userId: string) {
  return getAdminDb().doc(`users/${userId}/meta/botPending`)
}

/** The pending-flow kinds this build knows how to answer. A doc holding anything else
 *  (no `pendingKind`, or one from a build with a different flow set — e.g. the retired
 *  `category_confirm`) is dropped rather than half-answered; TTL is 15 minutes, so at
 *  most one in-flight draft per user is affected by a deploy. */
const KNOWN_PENDING_KINDS = new Set(['transaction_batch', 'goal_contribution'])

export async function getPending(userId: string): Promise<BotPendingDraft | null> {
  const snap = await pendingRef(userId).get()
  if (!snap.exists) return null
  const raw = snap.data() as Record<string, unknown> & { expiresAt?: Timestamp }

  // `expiresAt` is a plain `{_seconds,_nanoseconds}` (not a live `Timestamp`) on a doc
  // written by a REST call, export-import, or a console edit — `.toMillis()` would then
  // throw and every inbound message for this user would fail. Treat a missing/unreadable
  // stamp as expired, same as `claimPendingForCommit` does.
  const ms = raw.expiresAt?.toMillis?.()
  if (ms == null || ms < Date.now()) {
    await clearPending(userId)
    return null
  }
  if (typeof raw.pendingKind !== 'string' || !KNOWN_PENDING_KINDS.has(raw.pendingKind)) {
    await clearPending(userId)
    return null
  }
  return raw as unknown as BotPendingDraft
}

export async function setPending(
  userId: string,
  payload: GoalContributionDraft | DraftBatch,
): Promise<void> {
  await pendingRef(userId).set(
    stripUndefined({
      ...payload,
      expiresAt: Timestamp.fromMillis(Date.now() + PENDING_TTL_MS),
    }),
  )
}

export async function clearPending(userId: string): Promise<void> {
  await pendingRef(userId).delete()
}

/**
 * Atomically claims the pending transaction batch for a commit: in one Firestore
 * transaction, reads the draft and — if it is a live `transaction_batch` — deletes it
 * and returns it. A second concurrent `commit()` (double `ok`, double Simpan-tap, or a
 * retry after a post-write bookkeeping failure) then finds nothing and gets `null`, so
 * the batch is written exactly once. Returns `null` for a missing, expired, or
 * non-batch draft (the expired one is also cleared).
 */
export async function claimPendingForCommit(userId: string): Promise<BotPendingDraft | null> {
  const ref = pendingRef(userId)
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const raw = snap.data() as Record<string, unknown> & { expiresAt?: Timestamp }

    const ms = raw.expiresAt?.toMillis?.()
    if (ms == null || ms < Date.now()) {
      tx.delete(ref)
      return null
    }
    if (raw.pendingKind !== 'transaction_batch') return null

    tx.delete(ref)
    return raw as unknown as BotPendingDraft
  })
}

// ─── Financial data ──────────────────────────────────────────────
// Same read/write shapes `repositories` exposes to the client, reimplemented against
// the Admin SDK. Not reused directly: those repositories go through `getDb()` (the
// client SDK), which has no identity on the server and would be rejected by
// Firestore's security rules regardless of what credentials the process holds.

export async function findCategories(userId: string): Promise<Category[]> {
  const snap = await getAdminDb().collection(`users/${userId}/categories`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)
}

export async function getMonthlyBudget(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlyBudget | null> {
  const id = `${year}-${String(month).padStart(2, '0')}`
  const snap = await getAdminDb().doc(`users/${userId}/monthly_budgets/${id}`).get()
  return snap.exists ? ({ id: snap.id, ...snap.data() } as MonthlyBudget) : null
}

/** Mirrors the boolean rule in `month-lock.ts` (`Boolean(budget?.closedAt)`). This
 *  server path can't import that file directly — it queries via the client SDK. Keep
 *  both in sync if the closed-month rule ever changes. */
export function isBudgetClosedAdmin(budget: MonthlyBudget | null): boolean {
  return Boolean(budget?.closedAt)
}

export async function getMonthTransactions(
  userId: string,
  year: number,
  month: number,
): Promise<Transaction[]> {
  const from = Timestamp.fromDate(new Date(year, month - 1, 1))
  const to = Timestamp.fromDate(new Date(year, month, 1))
  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .where('date', '>=', from)
    .where('date', '<', to)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)
}

export async function getRecentTransactions(userId: string, limit = 5): Promise<Transaction[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .orderBy('date', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)
}

/** Half-open range `[from, to)`. Callers pass instants (already resolved to the user's
 *  local midnight — see `core.ts`'s `handlePeriodSummary`), so the DST-free +7 offset
 *  never has to be reasoned about here. */
export async function getTransactionsBetween(userId: string, from: Date, to: Date): Promise<Transaction[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .where('date', '>=', Timestamp.fromDate(from))
    .where('date', '<', Timestamp.fromDate(to))
    .orderBy('date', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)
}

/**
 * Keyword search over descriptions. Firestore has no substring operator, so the recent
 * window is fetched and filtered in memory — bounded by `scanLimit`, which is what
 * keeps this from turning into a full-collection read as the ledger grows.
 */
export async function searchTransactions(
  userId: string,
  keyword: string,
  limit = 10,
  scanLimit = 500,
): Promise<Transaction[]> {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return []

  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .orderBy('date', 'desc')
    .limit(scanLimit)
    .get()

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Transaction)
    .filter((tx) => (tx.description ?? '').toLowerCase().includes(needle))
    .slice(0, limit)
}

/**
 * Reads specific transactions by id. Used by `/undo` to learn which months a batch
 * touched before deleting from them. `documentId() in` caps at 10 values per query, so
 * ids are chunked — a bot batch is <=20, so this is one or two queries.
 */
export async function getTransactionsByIds(userId: string, ids: string[]): Promise<Transaction[]> {
  if (ids.length === 0) return []
  const col = getAdminDb().collection(`users/${userId}/transactions`)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10))
  const snaps = await Promise.all(chunks.map((chunk) => col.where(FieldPath.documentId(), 'in', chunk).get()))
  return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction))
}

export async function getYearTransactions(userId: string, year: number): Promise<Transaction[]> {
  const from = Timestamp.fromDate(new Date(year, 0, 1))
  const to = Timestamp.fromDate(new Date(year + 1, 0, 1))
  const snap = await getAdminDb()
    .collection(`users/${userId}/transactions`)
    .where('date', '>=', from)
    .where('date', '<', to)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)
}

/** Document ids are "YYYY-MM", so a lexical range on the id covers a whole year in one
 *  query — same trick `FirestoreBudgetRepository.findRange` uses on the client side. */
export async function getYearBudgets(userId: string, year: number): Promise<MonthlyBudget[]> {
  const snap = await getAdminDb()
    .collection(`users/${userId}/monthly_budgets`)
    .where(FieldPath.documentId(), '>=', `${year}-01`)
    .where(FieldPath.documentId(), '<=', `${year}-12`)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MonthlyBudget)
}

// ─── Savings goals ────────────────────────────────────────────────

export async function findGoals(userId: string): Promise<SavingsGoal[]> {
  const snap = await getAdminDb().collection(`users/${userId}/savings_goals`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SavingsGoal)
}

export async function findGoalById(userId: string, goalId: string): Promise<SavingsGoal | null> {
  const snap = await getAdminDb().doc(`users/${userId}/savings_goals/${goalId}`).get()
  return snap.exists ? ({ id: snap.id, ...snap.data() } as SavingsGoal) : null
}

/** Mirrors `ISavingsGoalRepository.addContribution`: one contribution record plus an
 *  atomic increment on the goal's running total, so two concurrent contributions can
 *  never clobber each other. */
export async function addGoalContribution(userId: string, goalId: string, amount: number): Promise<void> {
  const db = getAdminDb()
  const batch = db.batch()
  batch.set(db.collection(`users/${userId}/goal_contributions`).doc(), {
    goalId,
    amount,
    date: FieldValue.serverTimestamp(),
  })
  batch.update(db.doc(`users/${userId}/savings_goals/${goalId}`), {
    currentAmount: FieldValue.increment(amount),
  })
  await batch.commit()
}

// ─── Net worth (assets & liabilities, read live — never a stale saved snapshot) ──

export async function findAssets(userId: string): Promise<Asset[]> {
  const snap = await getAdminDb().collection(`users/${userId}/assets`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset)
}

export async function findLiabilities(userId: string): Promise<Liability[]> {
  const snap = await getAdminDb().collection(`users/${userId}/liabilities`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Liability)
}

// ─── Recurring rules ──────────────────────────────────────────────

export async function findRecurringRules(userId: string): Promise<RecurringRule[]> {
  const snap = await getAdminDb().collection(`users/${userId}/recurring_rules`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecurringRule)
}

/** Mirrors `IRecurringRuleRepository.skipOccurrence` — `arrayUnion` so two chats
 *  skipping at once cannot clobber each other's entry. */
export async function skipRecurringOccurrence(userId: string, ruleId: string, dayKey: string): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/recurring_rules/${ruleId}`)
    .update({ skippedDates: FieldValue.arrayUnion(dayKey) })
}

// ─── Wishlist ─────────────────────────────────────────────────────

export async function findWishlist(userId: string): Promise<Wishlist[]> {
  const snap = await getAdminDb().collection(`users/${userId}/wishlist`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Wishlist)
}

/**
 * Server-side rebuild of `CalculateAffordability.usecase.ts`'s `getFinancialContext` —
 * only the Firestore-reading part is reimplemented (Admin SDK vs. client SDK, same as
 * every other function in this file); the actual affordability math
 * (`analyseWishlistItem`/`calculateAffordability`) is imported and called unchanged by
 * `core.ts`, never copied.
 */
export async function getFinancialContextAdmin(
  userId: string,
  year: number,
  month: number,
): Promise<FinancialContext> {
  const [categories, transactions, budget, assets, liabilities] = await Promise.all([
    findCategories(userId),
    getMonthTransactions(userId, year, month),
    getMonthlyBudget(userId, year, month),
    findAssets(userId),
    findLiabilities(userId),
  ])

  const summary = buildMonthlySummary(categories, transactions, {
    year,
    month,
    totalIncome: budget?.totalIncome ?? 0,
    pillarConfig: budget?.pillarConfig ?? DEFAULT_PILLAR_CONFIG,
    overrides: budget?.categoryOverrides,
  })

  return {
    liquidAssets: liquidAssets(assets),
    existingMonthlyDebt: liabilities
      .filter((item) => item.remainingAmount > 0)
      .reduce((sum, item) => sum + item.monthlyPayment, 0),
    monthlyIncome: summary.totalIncome,
    monthlyExpenses: summary.totalUsed - summary.totalSaved,
    remainingBudget: Math.max(0, summary.totalBudget - summary.totalUsed),
  }
}

/** The one place the Firestore write shape for a transaction is defined — shared by the
 *  single-write and batch paths so a batch row is byte-for-byte what `createTransaction`
 *  would have written. */
function transactionPayload(dto: CreateTransactionDTO): Record<string, unknown> {
  return stripUndefined({
    date: Timestamp.fromDate(dto.date),
    type: dto.type,
    pillar: dto.pillar,
    categoryId: dto.categoryId,
    categoryItemId: dto.categoryItemId,
    amount: Math.abs(dto.amount),
    title: dto.title?.trim() || undefined,
    description: dto.description,
    items: dto.items ? sanitizeItems(dto.items) : undefined,
    tax: dto.tax !== undefined ? Math.max(0, Math.round(dto.tax)) : undefined,
    discount: dto.discount !== undefined ? Math.max(0, Math.round(dto.discount)) : undefined,
    tags: dto.tags ?? [],
    paymentMethod: dto.paymentMethod,
    gDriveFileId: dto.gDriveFileId,
    gDriveWebViewLink: dto.gDriveWebViewLink,
    gDriveThumbnailLink: dto.gDriveThumbnailLink,
    isRecurring: dto.isRecurring ?? false,
    recurringRuleId: dto.recurringRuleId,
    location: dto.location,
    mood: dto.mood,
  })
}

export async function createTransaction(userId: string, dto: CreateTransactionDTO): Promise<void> {
  const ref = getAdminDb().collection(`users/${userId}/transactions`).doc()
  await ref.set({
    ...transactionPayload(dto),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

// ─── Batch writes, timezone, undo memory ───────────────────────

/** Firestore caps a batch at 500 writes; `MAX_DRAFT_LINES` (20) keeps us far below,
 *  and this guard makes that dependency explicit rather than implicit. */
const MAX_BATCH_WRITES = 400

/**
 * Writes a whole reviewed batch atomically. All-or-nothing matters here: a partial
 * write would leave the user's ledger holding half of what the confirmation card
 * promised, with no way to tell which half.
 */
export async function createTransactionsBatch(
  userId: string,
  dtos: CreateTransactionDTO[],
): Promise<string[]> {
  if (dtos.length === 0) return []
  const db = getAdminDb()
  const batch = db.batch()
  const ids: string[] = []

  for (const dto of dtos.slice(0, MAX_BATCH_WRITES)) {
    const ref = db.collection(`users/${userId}/transactions`).doc()
    ids.push(ref.id)
    batch.set(ref, {
      ...transactionPayload(dto),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  return ids
}

export async function deleteTransactions(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const db = getAdminDb()
  const batch = db.batch()
  for (const id of ids.slice(0, MAX_BATCH_WRITES)) {
    batch.delete(db.doc(`users/${userId}/transactions/${id}`))
  }
  await batch.commit()
  return Math.min(ids.length, MAX_BATCH_WRITES)
}

function lastBatchRef(userId: string) {
  return getAdminDb().doc(`users/${userId}/meta/botLastBatch`)
}

/** What `/undo` reverses. Only ever the most recent commit — deeper history is the
 *  web app's job, where a list with checkboxes beats a chat command. */
export async function rememberLastBatch(userId: string, transactionIds: string[]): Promise<void> {
  await lastBatchRef(userId).set({ transactionIds, createdAt: FieldValue.serverTimestamp() })
}

export async function getLastBatch(
  userId: string,
): Promise<{ transactionIds: string[]; createdAt: Timestamp } | null> {
  const snap = await lastBatchRef(userId).get()
  if (!snap.exists) return null
  const data = snap.data() as { transactionIds?: string[]; createdAt?: Timestamp }
  if (!Array.isArray(data.transactionIds) || data.transactionIds.length === 0) return null
  return { transactionIds: data.transactionIds, createdAt: data.createdAt ?? Timestamp.now() }
}

export async function clearLastBatch(userId: string): Promise<void> {
  await lastBatchRef(userId).delete()
}

/** The Vercel runtime is UTC. Every user-facing timestamp must be rendered in the
 *  user's own zone or it reads seven hours wrong for an Indonesian user. */
export async function getUserTimezone(userId: string): Promise<string> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/profile`).get()
  const tz = snap.exists ? (snap.data()?.timezone as string | undefined) : undefined
  const trimmed = tz?.trim()
  if (!trimmed) return 'Asia/Jakarta'
  // A stored value like "WIB" or a typo'd "Asia/Jkarta" throws `RangeError` in every
  // `Intl.DateTimeFormat({ timeZone })` on the hot path (`formatDateTime`, `dayKeyInTz`)
  // — validate once here so one bad profile can't break every review card.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed })
  } catch {
    return 'Asia/Jakarta'
  }
  return trimmed
}

// ─── Per-user bot preferences (/mode, /atur) ────────────────────

/** Merged over defaults so a doc written by an older build stays valid, exactly like
 *  `FirestoreUserRepository.findSettings` does for the web app's settings. */
export async function getBotPrefs(userId: string): Promise<BotPrefs> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/botPrefs`).get()
  if (!snap.exists) return DEFAULT_BOT_PREFS
  return { ...DEFAULT_BOT_PREFS, ...(snap.data() as Partial<BotPrefs>) }
}

export async function saveBotPrefs(userId: string, patch: Partial<BotPrefs>): Promise<BotPrefs> {
  await getAdminDb().doc(`users/${userId}/meta/botPrefs`).set(stripUndefined(patch), { merge: true })
  return getBotPrefs(userId)
}

// ─── Scan hints (shared with the web receipt scanner) ──────────

/** The SAME document the web scanner learns into — `FirestoreReceiptScanRepository`
 *  writes `users/{uid}/meta/scan_hints`. Sharing it means a correction made on the web
 *  immediately makes the bot smarter, and a correction in chat improves the scanner. */
export async function getScanHints(userId: string): Promise<CategoryHint[]> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/scan_hints`).get()
  if (!snap.exists) return []
  return (snap.data()?.hints ?? []) as CategoryHint[]
}

export async function saveScanHints(userId: string, hints: CategoryHint[]): Promise<void> {
  await getAdminDb().doc(`users/${userId}/meta/scan_hints`).set({ hints }, { merge: true })
}

// ─── Gemini quota ledger ───────────────────────────────────────

/**
 * Shared Gemini quota ledger. Not scoped to a user: the free-tier quota belongs to the
 * API key, so every user's traffic draws from the same pool.
 *
 * Writes are per-model merge-writes (see `saveModelHealth`) so two concurrent pipelines
 * touching different tiers no longer clobber each other's increments. The read is still
 * a plain read-modify-write; a stale count at worst causes one extra 429, which the
 * router already handles by rotating.
 */
export async function getModelHealth(): Promise<{ dayKey: string; models: Record<string, ModelHealth> }> {
  const snap = await getAdminDb().doc('bot_meta/geminiHealth').get()
  if (!snap.exists) return { dayKey: '', models: {} }
  const data = snap.data() as { dayKey?: string; models?: Record<string, ModelHealth> }
  return { dayKey: data.dayKey ?? '', models: data.models ?? {} }
}

/**
 * `state === null` → whole-doc reset for a new Pacific day (one write, wipes every
 * prior per-model counter). Otherwise merge-write ONLY the touched model, so a
 * concurrent pipeline incrementing a different model's counter is not overwritten.
 */
export async function saveModelHealth(
  dayKey: string,
  modelId: string,
  state: ModelHealth | null,
): Promise<void> {
  const ref = getAdminDb().doc('bot_meta/geminiHealth')
  if (state === null) {
    await ref.set({ dayKey, models: {}, updatedAt: FieldValue.serverTimestamp() })
    return
  }
  await ref.set(
    { dayKey, models: { [modelId]: state }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

/** Per-user daily AI-call cap. The shared `bot_meta/geminiHealth` ledger only stops the
 *  whole API key from running dry; this stops ONE linked account from spending the
 *  free-tier pool on everyone else's behalf. */
export const DAILY_USER_MODEL_CAP = 40

/**
 * Bumps `users/{uid}/meta/botModelDay` `{ day, count }` and returns the new count. `day`
 * is the Pacific day key (matches Google's quota reset). A new day resets the counter
 * to 1; same day is an atomic `FieldValue.increment`.
 */
export async function bumpUserModelCalls(userId: string): Promise<number> {
  const ref = getAdminDb().doc(`users/${userId}/meta/botModelDay`)
  const today = dayKeyInTz(new Date(), 'America/Los_Angeles')
  const snap = await ref.get()
  const stored = snap.exists ? (snap.data() as { day?: string; count?: number }) : null

  if (!stored || stored.day !== today) {
    await ref.set({ day: today, count: 1 })
    return 1
  }

  await ref.set({ count: FieldValue.increment(1) }, { merge: true })
  const after = await ref.get()
  return (after.data() as { count?: number })?.count ?? 1
}

// ─── Model-result cache (keyed by content hash — see cache.ts) ──
//
// The same photo or sentence arriving twice is routine: GOWA retries a webhook it
// thinks failed, and a user who saw no reply re-sends. Each repeat used to cost two
// calls out of a twenty-a-day budget.

/** 30 days. Long enough that a re-send weeks later is free; short enough that a
 *  Firestore native TTL policy on `expiresAt` keeps the collection from growing. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** A Drive upload that already happened for this exact image — cached next to the
 *  read so a re-send reuses the file instead of creating a duplicate. */
type CachedReceiptUpload = { gDriveFileId: string; gDriveWebViewLink: string }

export interface CachedReceipt {
  result: ReceiptScanResult
  /** Absent on entries written before upload-caching, or when the upload had failed. */
  receipt?: CachedReceiptUpload
}

export async function getCachedReceipt(userId: string, hash: string): Promise<CachedReceipt | null> {
  const snap = await getAdminDb().doc(`users/${userId}/bot_receipt_cache/${hash}`).get()
  if (!snap.exists) return null
  const data = snap.data()
  if (!data?.result) return null
  return { result: data.result as ReceiptScanResult, receipt: (data.receipt as CachedReceiptUpload) ?? undefined }
}

export async function saveCachedReceipt(
  userId: string,
  hash: string,
  result: ReceiptScanResult,
  receipt?: CachedReceiptUpload,
): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/bot_receipt_cache/${hash}`)
    .set(
      stripUndefined({
        result,
        receipt,
        expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      }),
    )
}

export async function getCachedParse(userId: string, hash: string): Promise<ParsedLine[] | null> {
  const snap = await getAdminDb().doc(`users/${userId}/bot_parse_cache/${hash}`).get()
  if (!snap.exists) return null
  const lines = snap.data()?.lines
  return Array.isArray(lines) ? (lines as ParsedLine[]) : null
}

export async function saveCachedParse(userId: string, hash: string, lines: ParsedLine[]): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/bot_parse_cache/${hash}`)
    .set({ lines, expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS) })
}
