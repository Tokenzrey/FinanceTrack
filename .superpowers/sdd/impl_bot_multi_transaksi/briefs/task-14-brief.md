## Task 14: Jalur Nol-Model & Pembelajaran dari Koreksi

R13 + R15, dan pengungkit terbesar untuk R12. Kategori yang sudah pernah dikonfirmasi user tidak perlu ditanyakan lagi ke model.

**Temuan yang mendasari task ini:** `src/shared/lib/scan-hints.ts` sudah ada, sudah teruji, dan memuat `keywordFor`/`applyCorrections`/`hintsForItems`. Hint-nya disimpan di `users/{uid}/meta/scan_hints` dan sudah dipakai scanner web lewat `LearnFromCorrections.usecase.ts`. Jalur bot mengoper `[]` ke `extractReceipt` — jadi bot **tidak pernah** membaca maupun menambah memori itu. Task ini menyambungkannya.

**Files:**
- Create: `src/shared/bot/local-resolver.ts`
- Test: `src/shared/bot/local-resolver.test.ts`
- Modify: `src/shared/bot/types.ts` (`LocalMatch` — bentuknya di §12)
- Modify: `src/shared/bot/admin-data.ts` (`getScanHints`, `saveScanHints`)
- Modify: `src/shared/bot/flow-write.ts` (L0 di depan L1)
- Modify: `src/shared/bot/flow-review.ts` (tulis hint saat commit)
- Test: `src/shared/bot/flow-write.test.ts` (tambahan)

**Interfaces:**
- Consumes: `keywordFor`, `applyCorrections` dari `@/shared/lib/scan-hints`; `CategoryHint` dari `@/shared/types/receipt-scanner.types`; `getBotPrefs` dari Task 13
- Produces:
  - `resolveLocally(text, categories, hints, type?): LocalMatch | null`
  - `detectType(text): BotTxType | null`
  - `detectDateOffset(text): number`
  - `splitSegments(text): string[]`
  - `tryLocalBatch(text, categories, hints, now): DraftLine[] | null`
  - `LOCAL_ACCEPT_CONFIDENCE = 80`
- Produces di `admin-data.ts`: `getScanHints(userId): Promise<CategoryHint[]>`, `saveScanHints(userId, hints): Promise<void>`

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/local-resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Category } from '@/shared/types/domain'
import type { CategoryHint } from '@/shared/types/receipt-scanner.types'
import { detectDateOffset, detectType, resolveLocally, splitSegments, tryLocalBatch } from './local-resolver'

const NOW = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id, name, pillar, percentOfIncome: 0, color: '#000', icon: 'star',
    isSinkingFund: false, isRecurring: false, isActive: true, order: 0,
    createdAt: null as never, updatedAt: null as never,
  }
}

const CATEGORIES = [
  cat('c-food', 'Makan & Minum', 'needs'),
  cat('c-transport', 'Transportasi', 'needs'),
  cat('c-salary', 'Gaji', 'income'),
]

const hint = (keyword: string, categoryId: string, frequency: number): CategoryHint => ({
  keyword, categoryId, frequency, updatedAt: Date.now(),
})

describe('resolveLocally', () => {
  it('matches a category by its own name appearing in the message', () => {
    const match = resolveLocally('bayar transportasi 50rb', CATEGORIES, [])
    expect(match?.categoryId).toBe('c-transport')
    expect(match?.reason).toBe('category-name')
    expect(match?.confidence).toBeGreaterThanOrEqual(85)
  })

  it('matches a learned hint, with confidence growing as it is confirmed again', () => {
    const once = resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'c-food', 1)])
    const often = resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'c-food', 8)])
    expect(once?.categoryId).toBe('c-food')
    expect(often!.confidence).toBeGreaterThan(once!.confidence)
    expect(often!.confidence).toBeLessThanOrEqual(95)
  })

  it('ignores a hint pointing at a category that no longer exists', () => {
    expect(resolveLocally('kopi 20rb', CATEGORIES, [hint('kopi', 'deleted', 9)])).toBeNull()
  })

  it('returns null when nothing matches, rather than guessing', () => {
    expect(resolveLocally('xyzzy 20rb', CATEGORIES, [])).toBeNull()
  })

  it('never resolves a spend message to an income category', () => {
    const match = resolveLocally('beli kaos gaji 20rb', CATEGORIES, [hint('gaji', 'c-salary', 9)], 'expense')
    expect(match?.categoryId).not.toBe('c-salary')
  })

  it('resolves an income message only within income categories', () => {
    const match = resolveLocally('gaji masuk 5jt', CATEGORIES, [hint('gaji', 'c-salary', 9)], 'income')
    expect(match?.categoryId).toBe('c-salary')
  })
})

describe('detectType', () => {
  it('reads income wording', () => {
    for (const t of ['gaji masuk 5jt', 'terima bonus 1jt', 'refund 50rb', 'cashback 10rb', 'thr 2jt']) {
      expect(detectType(t)).toBe('income')
    }
  })

  it('reads transfer wording', () => {
    for (const t of ['pindah ke bca 1jt', 'transfer ke gopay 100rb', 'tf 50rb', 'tarik tunai 200rb', 'top up ovo 50rb']) {
      expect(detectType(t)).toBe('transfer')
    }
  })

  it('returns null for ordinary spending so the caller keeps its own default', () => {
    expect(detectType('makan siang 35rb')).toBeNull()
  })
})

describe('detectDateOffset', () => {
  it('reads the relative day words', () => {
    expect(detectDateOffset('kopi kemarin 20rb')).toBe(-1)
    expect(detectDateOffset('kopi kemarin lusa 20rb')).toBe(-2)
    expect(detectDateOffset('kopi 20rb')).toBe(0)
  })
})

describe('splitSegments', () => {
  it('splits on the separators people actually use', () => {
    expect(splitSegments('makan 35rb, bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb dan bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb\nbensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb; bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
    expect(splitSegments('makan 35rb,bensin 50rb')).toEqual(['makan 35rb', 'bensin 50rb'])
  })

  it('NEVER splits inside a number — that would silently rewrite an amount', () => {
    expect(splitSegments('beli hp 1,5jt')).toEqual(['beli hp 1,5jt'])
    expect(splitSegments('bayar kos 1.500.000')).toEqual(['bayar kos 1.500.000'])
    expect(splitSegments('transfer 1,250,000')).toEqual(['transfer 1,250,000'])
  })

  it('returns the whole message when there is nothing to split', () => {
    expect(splitSegments('makan siang 35rb')).toEqual(['makan siang 35rb'])
  })
})

describe('tryLocalBatch', () => {
  const hints = [hint('kopi', 'c-food', 9), hint('bensin', 'c-transport', 9)]

  it('builds a whole multi-transaction batch with no model call at all', () => {
    const lines = tryLocalBatch('kopi 20rb, bensin 50rb', CATEGORIES, hints, NOW)
    expect(lines).toHaveLength(2)
    expect(lines![0].categoryId).toBe('c-food')
    expect(lines![1].categoryId).toBe('c-transport')
    expect(lines!.map((l) => l.n)).toEqual([1, 2])
  })

  it('gives up entirely when any segment cannot be resolved locally', () => {
    // A half-local batch would mix confirmed knowledge with silent defaults, and the
    // user could not tell which line was which. Let the model see the whole message.
    expect(tryLocalBatch('kopi 20rb, xyzzy 50rb', CATEGORIES, hints, NOW)).toBeNull()
  })

  it('gives up when a segment has no parseable amount', () => {
    expect(tryLocalBatch('kopi 20rb, bensin', CATEGORIES, hints, NOW)).toBeNull()
  })

  it('applies the detected type and date per segment', () => {
    const lines = tryLocalBatch(
      'kopi kemarin 20rb, gaji masuk 5jt',
      CATEGORIES,
      [...hints, hint('gaji', 'c-salary', 9)],
      NOW,
    )
    expect(lines![0].dateIso.slice(0, 10)).toBe('2026-09-05')
    expect(lines![1].type).toBe('income')
    expect(lines![1].categoryId).toBe('c-salary')
  })

  it('keeps a decimal amount intact through the split', () => {
    const lines = tryLocalBatch('kopi 1,5jt', CATEGORIES, hints, NOW)
    expect(lines![0].amount).toBe(1_500_000)
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/bot/local-resolver.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `local-resolver.ts`**

```ts
import { keywordFor } from '@/shared/lib/scan-hints'
import type { Category } from '@/shared/types/domain'
import type { CategoryHint } from '@/shared/types/receipt-scanner.types'
import { parseAmount } from './parse-amount'
import type { BotTxType, DraftLine, LocalMatch } from './types'

/**
 * The zero-call layer. Everything here runs locally in under a millisecond and costs
 * no quota at all.
 *
 * It works because the review card teaches it: every category the user confirms is
 * written back as a `CategoryHint` (see `flow-review`), into the same
 * `users/{uid}/meta/scan_hints` document the web scanner already learns into. After a
 * few days of ordinary use "kopi", "bensin" and "indomaret" are known, and the most
 * common message a finance bot ever receives stops needing a model at all — while
 * being MORE accurate than the model, because the answer came from the user.
 */

const CATEGORY_NAME_CONFIDENCE = 92
const CATEGORY_HEAD_CONFIDENCE = 86
const HINT_BASE_CONFIDENCE = 60
const HINT_MAX_CONFIDENCE = 95

/** Local resolution must clear this before the fast path may skip confirmation. */
export const LOCAL_ACCEPT_CONFIDENCE = 80

const INCOME_WORDS = /\b(gaji|gajian|masuk|bonus|thr|terima|diterima|refund|cashback|bunga|dividen)\b/i
const TRANSFER_WORDS = /\b(pindah|pindahin|transfer|tf|topup|top ?up|isi ?saldo|tarik ?tunai|setor ?tunai)\b/i

export function detectType(text: string): BotTxType | null {
  // Transfer is checked first: "transfer masuk" is a transfer, not income.
  if (TRANSFER_WORDS.test(text)) return 'transfer'
  if (INCOME_WORDS.test(text)) return 'income'
  return null
}

export function detectDateOffset(text: string): number {
  const lower = text.toLowerCase()
  if (/\bkemarin lusa\b/.test(lower)) return -2
  if (/\bkemarin\b/.test(lower)) return -1
  return 0
}

/**
 * Splits "makan 35rb, bensin 50rb dan kopi 20rb" into its parts.
 *
 * The lookarounds are the whole point: a comma or semicolon flanked by digits is a
 * decimal point or a thousands separator, and splitting "1,5jt" would silently record
 * fifteen thousand rupiah instead of one and a half million.
 */
const SEGMENT_SPLIT = /(?<!\d)\s*[,;]\s*(?!\d)|\n+|\s+dan\s+/gi

export function splitSegments(text: string): string[] {
  return text
    .split(SEGMENT_SPLIT)
    .map((segment) => (segment ?? '').trim())
    .filter(Boolean)
}

function tokensOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  )
}

/** Income lines may only use income categories and spend lines may never use them —
 *  the same rule `draft.ts` and `flow-review.ts` enforce. */
function eligible(categories: Category[], type: BotTxType): Category[] {
  const active = categories.filter((c) => c.isActive)
  return type === 'income' ? active.filter((c) => c.pillar === 'income') : active.filter((c) => c.pillar !== 'income')
}

export function resolveLocally(
  text: string,
  categories: Category[],
  hints: CategoryHint[],
  type: BotTxType = detectType(text) ?? 'expense',
): LocalMatch | null {
  const pool = eligible(categories, type)
  const lower = text.toLowerCase()

  // 1. The category's own name said outright. Length floors keep a two-letter category
  //    from matching half the alphabet.
  for (const category of pool) {
    const name = category.name.toLowerCase()
    if (name.length >= 4 && lower.includes(name)) {
      return { categoryId: category.id, categoryName: category.name, confidence: CATEGORY_NAME_CONFIDENCE, reason: 'category-name' }
    }
  }
  for (const category of pool) {
    const head = category.name.toLowerCase().split(/[\s&/]+/)[0]
    if (head.length >= 5 && lower.includes(head)) {
      return { categoryId: category.id, categoryName: category.name, confidence: CATEGORY_HEAD_CONFIDENCE, reason: 'category-name' }
    }
  }

  // 2. A keyword the user confirmed before. Confidence grows with how often they
  //    confirmed it — one accidental tap should not become a standing rule.
  const tokens = tokensOf(text)
  const byId = new Map(pool.map((c) => [c.id, c]))
  const best = hints
    .filter((h) => byId.has(h.categoryId) && (tokens.has(h.keyword) || tokens.has(keywordFor(h.keyword))))
    .sort((a, b) => b.frequency - a.frequency)[0]

  if (best) {
    const category = byId.get(best.categoryId)!
    return {
      categoryId: category.id,
      categoryName: category.name,
      confidence: Math.min(HINT_MAX_CONFIDENCE, HINT_BASE_CONFIDENCE + best.frequency * 5),
      reason: 'hint',
    }
  }

  return null
}

/**
 * All-or-nothing: either every segment resolves locally, or the whole message goes to
 * the model. Returning a partly-local batch would put confirmed knowledge and silent
 * defaults side by side with nothing to tell them apart.
 */
export function tryLocalBatch(
  text: string,
  categories: Category[],
  hints: CategoryHint[],
  now: Date,
): DraftLine[] | null {
  const segments = splitSegments(text)
  const lines: DraftLine[] = []

  for (const segment of segments) {
    const amount = parseAmount(segment)
    if (amount === null || amount <= 0) return null

    const type = detectType(segment) ?? 'expense'
    const match = resolveLocally(segment, categories, hints, type)
    if (!match || match.confidence < LOCAL_ACCEPT_CONFIDENCE) return null

    const date = new Date(now.getTime())
    date.setUTCDate(date.getUTCDate() + detectDateOffset(segment))

    lines.push({
      n: lines.length + 1,
      type,
      amount,
      description: segment.trim() || null,
      categoryId: match.categoryId,
      categoryName: match.categoryName,
      dateIso: date.toISOString(),
      options: eligible(categories, type).slice(0, 4).map((c) => ({ categoryId: c.id, name: c.name })),
    })
  }

  return lines.length > 0 ? lines : null
}
```

Tambahkan `LocalMatch` (bentuknya di §12) ke `src/shared/bot/types.ts`.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/local-resolver.test.ts`
Expected: PASS (18 test).

- [ ] **Step 5: Baca/tulis hint dari sisi bot**

Tambahkan di `src/shared/bot/admin-data.ts`:

```ts
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
```

- [ ] **Step 6: Pasang L0 di depan L1**

Ganti isi `handleTextTransaction` di `src/shared/bot/flow-write.ts`:

```ts
export async function handleTextTransaction(userId: string, text: string): Promise<BotReply> {
  // One round trip for everything the decision needs.
  const [categories, hints, prefs] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getScanHints(userId),
    adminData.getBotPrefs(userId),
  ])
  const active = categories.filter((c) => c.isActive)
  const now = new Date()

  // L0 — no model call at all. Everything here came from the user's own confirmed
  // history, so it is simultaneously the fastest path and the most accurate one.
  const localLines = tryLocalBatch(text, active, hints, now)
  if (localLines) {
    const batch = newBatch({ source: 'text', lines: localLines })
    if (localLines.length === 1 && !prefs.alwaysReview) {
      return commitDirect(userId, batch, categories)
    }
    return startReview(userId, batch)
  }

  // L1 — text tier (flash-lite): 500/day per model, and lower latency than flash.
  const parsed = await parseTransactionBatch(text, active)
  const lines = buildLinesFromParsed(parsed, active, now)
  if (lines.length === 0) return replies.amountNotFound()

  const topConfidence = parsed[0]?.confidence ?? 0
  if (isFastPath(lines) && topConfidence >= prefs.autoAcceptConfidence && !prefs.alwaysReview) {
    return commitDirect(userId, newBatch({ source: 'text', lines }), categories)
  }

  return startReview(userId, newBatch({ source: 'text', lines }))
}
```

Hapus konstanta `AUTO_ACCEPT_CONFIDENCE` di file itu — ambangnya sekarang milik user (Task 13).

Di `handlePhoto`, ganti `[]` dengan hint sungguhan:

```ts
  const [categories, hints] = await Promise.all([
    adminData.findCategories(userId),
    adminData.getScanHints(userId),
  ])
  const spendCategories = categories.filter((c) => c.isActive && c.pillar !== 'income')

  let result
  try {
    result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      // Was `[]` — the bot never used the memory the web scanner had been building.
      hints,
      msg.caption,
    )
  }
```

- [ ] **Step 7: Tulis hint saat user mengonfirmasi**

Di `commit()` dalam `src/shared/bot/flow-review.ts`, tepat sebelum `await adminData.clearPending(userId)`:

```ts
  // Learning loop: every confirmed line teaches the local resolver, so the next
  // "kopi 20rb" needs no model at all. A failure here must never cost the user their
  // transactions — those are already written.
  try {
    const corrections = batch.lines
      .filter((l) => l.categoryId && l.description)
      .map((l) => ({ itemName: l.description as string, categoryId: l.categoryId as string }))
    if (corrections.length > 0) {
      const existing = await adminData.getScanHints(userId)
      await adminData.saveScanHints(userId, applyCorrections(existing, corrections))
    }
  } catch (error) {
    console.error('bot hint learning error (transactions already saved):', error)
  }
```

Tambahkan `import { applyCorrections } from '@/shared/lib/scan-hints'`.

- [ ] **Step 8: Test integrasi jalur cepat**

Tambahkan mock `getScanHints`, `saveScanHints`, `getBotPrefs` ke blok `vi.mock('./admin-data', ...)` di `flow-write.test.ts` dan `flow-review.test.ts`, lalu tambahkan ke `flow-write.test.ts`:

```ts
  it('records a known phrase with ZERO model calls', async () => {
    getScanHints.mockResolvedValue([{ keyword: 'kopi', categoryId: 'c-food', frequency: 9, updatedAt: 0 }])
    const reply = await handleTextTransaction('u1', 'kopi 20rb')
    expect(parseTransactionBatch).not.toHaveBeenCalled()
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('Tercatat')
  })

  it('builds a multi-line batch locally, still with zero model calls', async () => {
    getScanHints.mockResolvedValue([
      { keyword: 'kopi', categoryId: 'c-food', frequency: 9, updatedAt: 0 },
      { keyword: 'bensin', categoryId: 'c-food', frequency: 9, updatedAt: 0 },
    ])
    await handleTextTransaction('u1', 'kopi 20rb, bensin 50rb')
    expect(parseTransactionBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
  })

  it('falls through to the model when the local layer cannot resolve everything', async () => {
    getScanHints.mockResolvedValue([])
    parseTransactionBatch.mockResolvedValue([parsed()])
    await handleTextTransaction('u1', 'sesuatu yang baru 35rb')
    expect(parseTransactionBatch).toHaveBeenCalledTimes(1)
  })

  it('always opens the review card when the user set alwaysReview', async () => {
    getBotPrefs.mockResolvedValue({ ...DEFAULT_BOT_PREFS, alwaysReview: true })
    getScanHints.mockResolvedValue([{ keyword: 'kopi', categoryId: 'c-food', frequency: 9, updatedAt: 0 }])
    await handleTextTransaction('u1', 'kopi 20rb')
    expect(createTransactionsBatch).not.toHaveBeenCalled()
    expect(setPending).toHaveBeenCalledTimes(1)
  })

  it('passes the learned hints to the receipt extractor instead of an empty list', async () => {
    const hints = [{ keyword: 'indomie', categoryId: 'c-food', frequency: 4, updatedAt: 0 }]
    getScanHints.mockResolvedValue(hints)
    extractReceipt.mockResolvedValue(receiptResult())
    await handlePhoto('u1', photo())
    expect(extractReceipt.mock.calls[0][3]).toEqual(hints)
  })
```

Dan ke `flow-review.test.ts`:

```ts
  it('writes a category hint for every confirmed line', async () => {
    getScanHints.mockResolvedValue([])
    await handleReviewMessage('u1', batch(), text('ok'))
    expect(saveScanHints).toHaveBeenCalledTimes(1)
    const saved = saveScanHints.mock.calls[0][1] as { keyword: string; categoryId: string }[]
    expect(saved.some((h) => h.categoryId === 'c-food')).toBe(true)
  })

  it('still reports success when hint learning fails — the money is already saved', async () => {
    saveScanHints.mockRejectedValue(new Error('firestore down'))
    const reply = await handleReviewMessage('u1', batch(), text('ok'))
    expect(createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(reply.text).toContain('tercatat')
  })
```

- [ ] **Step 9: Jalankan semua & commit**

Run: `npx vitest run && npx tsc --noEmit && npx next lint --dir src`
Expected: PASS, exit 0.

```bash
git add src/shared/bot/local-resolver.ts src/shared/bot/local-resolver.test.ts src/shared/bot/types.ts src/shared/bot/admin-data.ts src/shared/bot/flow-write.ts src/shared/bot/flow-write.test.ts src/shared/bot/flow-review.ts src/shared/bot/flow-review.test.ts
git commit -m "feat(bot): answer known phrases with no model call, and learn from every confirmation

scan-hints.ts already existed, already stored CategoryHints at
users/{uid}/meta/scan_hints, and the web scanner already learned into it. The bot
passed [] and never read or wrote it. This connects the two, so a correction on the
web makes the bot smarter and a correction in chat improves the scanner.

Every confirmed review line writes a hint back, so ordinary repeat traffic stops
needing a model within days. That path is both the fastest (sub-400ms, no network) and
the most accurate, because the answer came from the user rather than a guess.

splitSegments uses lookarounds around the separator: a comma flanked by digits is a
decimal point, and splitting '1,5jt' would have recorded fifteen thousand rupiah
instead of one and a half million.

tryLocalBatch is all-or-nothing on purpose — a partly-local batch would sit confirmed
knowledge next to silent defaults with nothing to tell them apart."
```

---
