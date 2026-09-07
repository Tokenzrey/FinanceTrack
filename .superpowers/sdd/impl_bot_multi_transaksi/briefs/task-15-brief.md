## Task 15: Cache Hasil Model

R13 + R12. Foto atau kalimat yang sama tidak dibayar dua kali. Ini bukan optimasi mikro: webhook GOWA mengulang kiriman, dan user memang sering mengirim ulang struk yang sama karena mengira gagal.

**Files:**
- Create: `src/shared/bot/cache.ts`
- Test: `src/shared/bot/cache.test.ts`
- Modify: `src/shared/bot/admin-data.ts` (baca/tulis cache)
- Modify: `src/shared/bot/flow-write.ts` (cek cache sebelum memanggil model)

**Interfaces:**
- Produces:
  - `hashImage(base64: string): string`
  - `hashParse(text: string, categoryIds: string[]): string`
  - `stripForCache(result: ReceiptScanResult): ReceiptScanResult`
- Produces di `admin-data.ts`:
  - `getCachedReceipt(userId, hash): Promise<ReceiptScanResult | null>`
  - `saveCachedReceipt(userId, hash, result): Promise<void>`
  - `getCachedParse(userId, hash): Promise<ParsedLine[] | null>`
  - `saveCachedParse(userId, hash, lines): Promise<void>`

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'
import { hashImage, hashParse, stripForCache } from './cache'

describe('hashImage', () => {
  it('is stable for identical bytes and different for different bytes', () => {
    expect(hashImage('AAAA')).toBe(hashImage('AAAA'))
    expect(hashImage('AAAA')).not.toBe(hashImage('AAAB'))
  })

  it('produces a Firestore-safe document id', () => {
    expect(hashImage('AAAA')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('hashParse', () => {
  it('ignores case and surrounding whitespace, which do not change meaning', () => {
    expect(hashParse('  Kopi 20rb ', ['c1'])).toBe(hashParse('kopi 20rb', ['c1']))
  })

  it('changes when the category set changes, so a renamed or new category invalidates it', () => {
    expect(hashParse('kopi 20rb', ['c1'])).not.toBe(hashParse('kopi 20rb', ['c1', 'c2']))
  })

  it('does not depend on the order the category ids arrive in', () => {
    expect(hashParse('kopi 20rb', ['c1', 'c2'])).toBe(hashParse('kopi 20rb', ['c2', 'c1']))
  })
})

describe('stripForCache', () => {
  it('drops rawText, which is the only field big enough to threaten the 1 MiB doc limit', () => {
    const result = {
      extraction: { rawText: 'x'.repeat(100_000), items: [], total: 1000, confidence: 90 },
      mappedItems: [],
      totalConfidence: 90,
      warnings: [],
    } as unknown as ReceiptScanResult

    const stripped = stripForCache(result)
    expect(stripped.extraction.rawText).toBe('')
    expect(stripped.extraction.total).toBe(1000)
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/bot/cache.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `cache.ts`**

```ts
import { createHash } from 'node:crypto'
import type { ReceiptScanResult } from '@/shared/types/receipt-scanner.types'

/**
 * Cache keys for model results.
 *
 * The same photo arriving twice is routine, not exotic: GOWA retries a webhook it
 * thinks failed, and a user who saw no reply for twenty seconds sends the receipt
 * again. Each of those repeats used to cost two calls out of a twenty-a-day budget.
 */

export function hashImage(base64: string): string {
  return createHash('sha256').update(base64).digest('hex')
}

/**
 * Text parses are cached against the category set as well as the message: the model's
 * answer names category ids, so adding, deleting, or re-scoping a category makes every
 * earlier answer stale.
 */
export function hashParse(text: string, categoryIds: string[]): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const categories = [...categoryIds].sort().join(',')
  return createHash('sha256').update(`${normalized}␟${categories}`).digest('hex')
}

/** `rawText` is the full OCR dump — easily 50-100 KB, and useless once the items are
 *  extracted. Everything else in a scan result is small. */
export function stripForCache(result: ReceiptScanResult): ReceiptScanResult {
  return { ...result, extraction: { ...result.extraction, rawText: '' } }
}
```

- [ ] **Step 4: Penyimpanan cache**

Tambahkan di `src/shared/bot/admin-data.ts`:

```ts
/** 30 days. Long enough that a re-send weeks later is free; short enough that a
 *  Firestore native TTL policy on `expiresAt` keeps the collection from growing. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function getCachedReceipt(userId: string, hash: string): Promise<ReceiptScanResult | null> {
  const snap = await getAdminDb().doc(`users/${userId}/bot_receipt_cache/${hash}`).get()
  if (!snap.exists) return null
  return (snap.data()?.result ?? null) as ReceiptScanResult | null
}

export async function saveCachedReceipt(
  userId: string,
  hash: string,
  result: ReceiptScanResult,
): Promise<void> {
  await getAdminDb()
    .doc(`users/${userId}/bot_receipt_cache/${hash}`)
    .set({ result, expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS) })
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
```

- [ ] **Step 5: Pasang cache di jalur tulis**

Di `handleTextTransaction` (`flow-write.ts`), antara L0 dan L1:

```ts
  // L0.5 — the same sentence, with the same categories, has the same answer.
  const parseKey = hashParse(text, active.map((c) => c.id))
  let parsed = await adminData.getCachedParse(userId, parseKey)
  if (!parsed) {
    parsed = await parseTransactionBatch(text, active)
    // A fallback line means the model never actually answered; caching it would pin
    // the failure in place for 30 days.
    if (parsed.length > 0 && parsed[0].confidence > 0) {
      await adminData.saveCachedParse(userId, parseKey, parsed)
    }
  }
```

Di `handlePhoto`, sebelum `extractReceipt`:

```ts
  const imageKey = hashImage(msg.imageBase64)
  let result = await adminData.getCachedReceipt(userId, imageKey)

  if (!result) {
    try {
      result = await extractReceipt(/* ...seperti sebelumnya... */)
    } catch (error) {
      console.error('bot handlePhoto extractReceipt error:', error)
      if (isAiQuotaOrOverloadError(error)) return replies.aiUnavailable()
      return replies.genericError()
    }
    // Cache only a usable read. A "not a receipt" verdict on a bad angle should not
    // survive the user re-taking the photo.
    if (result.totalConfidence >= 20 && result.extraction.total > 0) {
      await adminData.saveCachedReceipt(userId, imageKey, stripForCache(result))
    }
  }
```

- [ ] **Step 6: Test integrasi cache**

Tambahkan ke `flow-write.test.ts` (mock `getCachedReceipt`/`saveCachedReceipt`/`getCachedParse`/`saveCachedParse`):

```ts
  it('re-uses a cached receipt read instead of spending vision quota again', async () => {
    getCachedReceipt.mockResolvedValue(receiptResult())
    const reply = await handlePhoto('u1', photo())
    expect(extractReceipt).not.toHaveBeenCalled()
    expect(reply.text).toContain('Tinjau')
  })

  it('caches a usable read, but not a rejected one', async () => {
    getCachedReceipt.mockResolvedValue(null)
    extractReceipt.mockResolvedValue(receiptResult())
    await handlePhoto('u1', photo())
    expect(saveCachedReceipt).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    getCachedReceipt.mockResolvedValue(null)
    extractReceipt.mockResolvedValue(receiptResult({ totalConfidence: 5 }))
    await handlePhoto('u1', photo())
    expect(saveCachedReceipt).not.toHaveBeenCalled()
  })

  it('does not cache a parse that came back as the zero-confidence fallback', async () => {
    getScanHints.mockResolvedValue([])
    getCachedParse.mockResolvedValue(null)
    parseTransactionBatch.mockResolvedValue([parsed({ confidence: 0 })])
    await handleTextTransaction('u1', 'entah 35rb')
    expect(saveCachedParse).not.toHaveBeenCalled()
  })
```

- [ ] **Step 7: Jalankan & commit**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/shared/bot/cache.ts src/shared/bot/cache.test.ts src/shared/bot/admin-data.ts src/shared/bot/flow-write.ts src/shared/bot/flow-write.test.ts
git commit -m "feat(bot): cache model results by content hash

The same photo arriving twice is routine — GOWA retries a webhook it thinks failed,
and a user who saw no reply for twenty seconds sends the receipt again. Each repeat
used to cost two calls out of a twenty-a-day budget.

Text parses key on the message AND the category id set, because the model's answer
names category ids and a new or deleted category makes every earlier answer stale.
rawText is stripped before storing: it is the only field big enough to threaten the
1 MiB document limit.

Failures are never cached. A quota error or a bad-angle rejection must not be pinned
in place for thirty days."
```

---

