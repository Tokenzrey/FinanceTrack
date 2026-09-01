import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/shared/lib/firebase-admin'
import type { Category, MonthlyBudget, Transaction } from '@/shared/types/domain'
import type { CreateTransactionDTO } from '@/shared/types/dto'
import type { BotPlatform } from './types'

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
function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
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

/** Random, URL-safe, human-typeable — excludes visually ambiguous characters
 *  (0/O, 1/I/L) since the user has to retype this by hand into a chat. */
function randomLinkCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const db = getAdminDb()
  const code = randomLinkCode()
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)
  await db.collection('bot_link_codes').doc(code).set({
    userId,
    expiresAt: Timestamp.fromDate(expiresAt),
    usedAt: null,
  })
  return { code, expiresAt }
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

// ─── Pending draft (category confirmation, text or photo) ───────

export interface BotPendingDraft {
  draft: {
    amount: number
    description: string | null
    /** ISO string, not a Timestamp — sidesteps any Admin/client Timestamp
     *  nominal-typing friction when this later becomes a `CreateTransactionDTO.date`. */
    dateIso: string
  }
  options: { categoryId: string; name: string }[]
  receipt?: { gDriveFileId: string; gDriveWebViewLink: string }
  expiresAt: Timestamp
}

function pendingRef(userId: string) {
  return getAdminDb().doc(`users/${userId}/meta/botPending`)
}

export async function getPending(userId: string): Promise<BotPendingDraft | null> {
  const snap = await pendingRef(userId).get()
  if (!snap.exists) return null
  const data = snap.data() as BotPendingDraft
  if (data.expiresAt.toMillis() < Date.now()) {
    await clearPending(userId)
    return null
  }
  return data
}

export async function setPending(userId: string, draft: Omit<BotPendingDraft, 'expiresAt'>): Promise<void> {
  await pendingRef(userId).set(
    stripUndefined({
      ...draft,
      expiresAt: Timestamp.fromMillis(Date.now() + PENDING_TTL_MS),
    }),
  )
}

export async function clearPending(userId: string): Promise<void> {
  await pendingRef(userId).delete()
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

export async function createTransaction(userId: string, dto: CreateTransactionDTO): Promise<void> {
  const db = getAdminDb()
  const ref = db.collection(`users/${userId}/transactions`).doc()
  const payload = stripUndefined({
    date: Timestamp.fromDate(dto.date),
    type: dto.type,
    pillar: dto.pillar,
    categoryId: dto.categoryId,
    categoryItemId: dto.categoryItemId,
    amount: Math.abs(dto.amount),
    description: dto.description,
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
  await ref.set({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}
