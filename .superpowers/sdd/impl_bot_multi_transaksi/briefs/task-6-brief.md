## Task 6: Persistensi Batch, Tulis Massal, Zona Waktu

Sisi Firestore untuk R3/R4/R6 plus prasyarat R8 (zona waktu) dan `/undo` (Task 11).

**Files:**
- Modify: `src/shared/bot/admin-data.ts`
- Test: `src/shared/bot/admin-data.test.ts` (tambah blok baru)

**Interfaces:**
- Consumes: `DraftBatch` dari `./types`; `CreateTransactionDTO` dari `@/shared/types/dto`
- Produces:
  - `BotPendingDraft` = `(CategoryConfirmDraft | GoalContributionDraft | DraftBatch) & { expiresAt: Timestamp }`
  - `createTransactionsBatch(userId: string, dtos: CreateTransactionDTO[]): Promise<string[]>`
  - `deleteTransactions(userId: string, ids: string[]): Promise<number>`
  - `rememberLastBatch(userId: string, transactionIds: string[]): Promise<void>`
  - `getLastBatch(userId: string): Promise<{ transactionIds: string[]; createdAt: Timestamp } | null>`
  - `clearLastBatch(userId: string): Promise<void>`
  - `getUserTimezone(userId: string): Promise<string>`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `src/shared/bot/admin-data.test.ts` (ikuti pola mock Firestore Admin yang sudah dipakai file itu):

```ts
describe('createTransactionsBatch', () => {
  it('writes every DTO in one Firestore batch and returns their new ids', async () => {
    const ids = await adminData.createTransactionsBatch('user-1', [
      { date: new Date(), type: 'expense', pillar: 'needs', categoryId: 'c1', amount: 1000, tags: ['bot'] },
      { date: new Date(), type: 'income', pillar: 'income', categoryId: 'c2', amount: 2000, tags: ['bot'] },
    ])
    expect(ids).toHaveLength(2)
    expect(batchCommit).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledTimes(2)
  })

  it('is a no-op that commits nothing for an empty list', async () => {
    expect(await adminData.createTransactionsBatch('user-1', [])).toEqual([])
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('drops undefined optional fields rather than sending them to Firestore', async () => {
    await adminData.createTransactionsBatch('user-1', [
      { date: new Date(), type: 'expense', pillar: 'needs', categoryId: 'c1', amount: 1000, description: undefined },
    ])
    const written = batchSet.mock.calls[0][1] as Record<string, unknown>
    expect('description' in written).toBe(false)
    expect('gDriveFileId' in written).toBe(false)
  })

  it('preserves transfer as the written type', async () => {
    await adminData.createTransactionsBatch('user-1', [
      { date: new Date(), type: 'transfer', pillar: 'savings', categoryId: 'c1', amount: 1000 },
    ])
    expect((batchSet.mock.calls[0][1] as { type: string }).type).toBe('transfer')
  })
})

describe('getPending — legacy drafts', () => {
  it('clears and ignores a pendingKind this build no longer understands', async () => {
    docData = { pendingKind: 'category_confirm', draft: {}, options: [], expiresAt: futureTimestamp() }
    expect(await adminData.getPending('user-1')).toBeNull()
    expect(docDelete).toHaveBeenCalled()
  })

  it('returns a transaction_batch draft unchanged', async () => {
    docData = {
      pendingKind: 'transaction_batch',
      source: 'text',
      lines: [],
      mode: 'itemized',
      merchant: null,
      receiptTotal: null,
      warnings: [],
      expiresAt: futureTimestamp(),
    }
    const pending = await adminData.getPending('user-1')
    expect(pending?.pendingKind).toBe('transaction_batch')
  })
})

describe('getUserTimezone', () => {
  it('reads the profile timezone', async () => {
    docData = { timezone: 'Asia/Makassar' }
    expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Makassar')
  })

  it('defaults to Asia/Jakarta when the profile is missing or blank', async () => {
    docExists = false
    expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Jakarta')

    docExists = true
    docData = { timezone: '  ' }
    expect(await adminData.getUserTimezone('user-1')).toBe('Asia/Jakarta')
  })
})

describe('last batch (for /undo)', () => {
  it('remembers ids, reads them back, and clears them', async () => {
    await adminData.rememberLastBatch('user-1', ['t1', 't2'])
    expect(docSet).toHaveBeenCalled()

    docData = { transactionIds: ['t1', 't2'], createdAt: futureTimestamp() }
    expect((await adminData.getLastBatch('user-1'))?.transactionIds).toEqual(['t1', 't2'])

    await adminData.clearLastBatch('user-1')
    expect(docDelete).toHaveBeenCalled()
  })
})

describe('deleteTransactions', () => {
  it('deletes every id in one batch and reports the count', async () => {
    expect(await adminData.deleteTransactions('user-1', ['t1', 't2', 't3'])).toBe(3)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('commits nothing for an empty id list', async () => {
    expect(await adminData.deleteTransactions('user-1', [])).toBe(0)
    expect(batchCommit).not.toHaveBeenCalled()
  })
})
```

> Jika helper mock (`batchSet`, `batchCommit`, `docDelete`, `docSet`, `docData`, `docExists`, `futureTimestamp`) belum ada di `admin-data.test.ts`, tambahkan mengikuti pola mock `getAdminDb` yang sudah dipakai file itu — jangan menulis ulang mock yang sudah ada.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/admin-data.test.ts`
Expected: FAIL — `adminData.createTransactionsBatch is not a function`.

- [ ] **Step 3: Perluas `BotPendingDraft` dan `getPending`**

Di `src/shared/bot/admin-data.ts`, tambahkan impor `import type { DraftBatch } from './types'` dan ganti definisi `BotPendingDraft` serta `getPending`:

```ts
export type BotPendingDraft = (CategoryConfirmDraft | GoalContributionDraft | DraftBatch) & {
  expiresAt: Timestamp
}

/** The kinds this build knows how to answer. A doc holding anything else was written
 *  by an older build (`category_confirm` from before the review card); it is dropped
 *  rather than half-answered — TTL is 15 minutes, so at most one in-flight draft per
 *  user is affected by a deploy. */
const KNOWN_PENDING_KINDS = new Set(['transaction_batch', 'goal_contribution'])

export async function getPending(userId: string): Promise<BotPendingDraft | null> {
  const snap = await pendingRef(userId).get()
  if (!snap.exists) return null
  const raw = snap.data() as Record<string, unknown> & { expiresAt: Timestamp }

  if (raw.expiresAt.toMillis() < Date.now()) {
    await clearPending(userId)
    return null
  }
  if (typeof raw.pendingKind !== 'string' || !KNOWN_PENDING_KINDS.has(raw.pendingKind)) {
    await clearPending(userId)
    return null
  }

  return raw as unknown as BotPendingDraft
}
```

`setPending` sudah menerima union-nya lewat parameter; ganti tipe parameternya jadi:

```ts
export async function setPending(
  userId: string,
  payload: CategoryConfirmDraft | GoalContributionDraft | DraftBatch,
): Promise<void> {
```

- [ ] **Step 4: Implementasi tulis massal, zona waktu, dan memori batch terakhir**

Tambahkan di akhir `src/shared/bot/admin-data.ts`:

```ts
/** Firestore caps a batch at 500 writes; `MAX_DRAFT_LINES` (20) keeps us far below,
 *  and this guard makes that dependency explicit rather than implicit. */
const MAX_BATCH_WRITES = 400

function transactionPayload(dto: CreateTransactionDTO): Record<string, unknown> {
  return stripUndefined({
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
}

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
  return tz && tz.trim() ? tz.trim() : 'Asia/Jakarta'
}
```

Refactor `createTransaction` yang sudah ada agar memakai `transactionPayload` supaya bentuk tulisannya persis sama di kedua jalur:

```ts
export async function createTransaction(userId: string, dto: CreateTransactionDTO): Promise<void> {
  const ref = getAdminDb().collection(`users/${userId}/transactions`).doc()
  await ref.set({
    ...transactionPayload(dto),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/admin-data.test.ts`
Expected: PASS (test lama tetap hijau — `createTransaction` menulis bentuk yang sama).

- [ ] **Step 6: Typecheck & commit**

```bash
npx tsc --noEmit
git add src/shared/bot/admin-data.ts src/shared/bot/admin-data.test.ts
git commit -m "feat(bot): atomic batch writes, timezone lookup, undo memory

createTransactionsBatch commits a reviewed batch all-or-nothing — a partial write
would leave the ledger holding half of what the confirmation card promised.

getPending now drops any pendingKind this build does not understand, so a legacy
category_confirm doc left over from a deploy expires instead of being half-answered.

getUserTimezone exists because the Vercel runtime is UTC: without it every stamp
reads seven hours wrong for an Indonesian user."
```

---

