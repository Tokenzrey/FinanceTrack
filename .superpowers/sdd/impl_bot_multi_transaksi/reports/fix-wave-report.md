# Fix-wave report — final review of `feat/bot-multi-transaksi`

Base HEAD `7c338fd` (suite 590). One commit. Gates after: `npx vitest run` **604 passed / 37 files**, `npx tsc --noEmit` **0**, `npx next lint --dir src` **clean**.

TDD note: every item had a failing test added/adjusted first (they fail against `7c338fd`), then the fix, then confirmed green.

---

## C1 [CRITICAL] — `splitSegments` fails to split `"kopi 20000, teh 5000"`

**File:** `src/shared/bot/local-resolver.ts`

**Change:** replaced `SEGMENT_SPLIT`. Old single alternative `(?<!\d)\s*[,;]\s*(?!\d)` suppressed the split whenever a digit merely *abutted* the separator across whitespace — every plain-rupiah list. New:

```ts
const SEGMENT_SPLIT = /(?<!\d)\s*[,;]\s*|\s*[,;]\s*(?!\d)|\n+|\s+dan\s+/gi
```

A `,`/`;` is now a separator unless it has a digit **immediately on both sides** (`1,5jt`, `1,250,000`) — the split is suppressed only when *neither* alternative matches. Dots are never separators, so `1.500.000` was and stays intact. No sentinel-substitution needed.

**Covering tests** (`local-resolver.test.ts`):
- `splitSegments` — new: `'kopi 20000, teh 5000'` → 2; `'jajan 100.000, bensin 50.000'` → 2; `'a 1rb; b 2rb'`, `'a 1rb dan b 2rb'`, `'a 1rb\nb 2rb'` → 2; new: `'kos 1.500.000, listrik 200.000'` → `['kos 1.500.000','listrik 200.000']` (preserve + split together).
- `tryLocalBatch` — new: `'kopi 20000, bensin 50000'` → 2 lines, amounts `20000` / `50000` (proves the auto-commit no longer drops all-but-first).
- All 18 pre-existing cases still green (incl. `1,5jt`, `1.500.000`, `1,250,000` kept whole).

**Result:** pass.

---

## I1 [IMPORTANT] — no "has an amount at all" pre-check before the L1 model call

**File:** `src/shared/bot/flow-write.ts` (`handleTextTransaction`)

**Change:** imported `parseAmount` from `./parse-amount`; after `tryLocalBatch` returns null and before the parse cache / `parseTransactionBatch`, added:

```ts
if (parseAmount(text) === null) return replies.amountNotFound()
```

`parseAmount` is non-null for any message with >=1 parseable amount, so real multi-transaction messages are unaffected.

**Covering test** (`flow-write.test.ts`): new — `"halo apa kabar"` returns `amountNotFound`, and `parseTransactionBatch` **and** `getCachedParse` are NOT called. Existing "asks for a number…" case still green.

**Result:** pass.

---

## I2 [IMPORTANT] — `/undo` deletes from a month-locked budget

**Files:** `src/shared/bot/core.ts` (`handleUndo`), `src/shared/bot/admin-data.ts`

**Change:**
- New reader `adminData.getTransactionsByIds(userId, ids)` — `where(documentId(), 'in', chunk)` chunked by 10 (a bot batch is <=20), maps `{id, ...data}`.
- `handleUndo` now loads the batch's transactions, collects distinct `year-month` from their dates, and if `isBudgetClosedAdmin(getMonthlyBudget(...))` is true for ANY, returns `replies.monthClosed(y, m)` before `deleteTransactions` / `clearLastBatch`.

**Covering tests:**
- `core.test.ts` — added `getTransactionsByIds` to the `./admin-data` mock (+ `beforeEach` default `[]`). New: undo blocked when the batch's month is closed (asserts `getMonthlyBudget('user-1', 2026, 7)`, no delete, no clear, reply "sudah ditutup"); undo proceeds when the month is open (delete + clear + "2 transaksi dibatalkan"). Both pre-existing undo cases still green.
- `admin-data.test.ts` — new: `getTransactionsByIds` chunks 12 ids into 10 + 2 `in` queries and maps `{id,...data}`; no-op for `[]`.

**Result:** pass.

---

## T15 [deferred→fix] — cached receipt re-uploads to Drive on every re-send

**Files:** `src/shared/bot/admin-data.ts`, `src/shared/bot/flow-write.ts`

**Change:**
- `bot_receipt_cache` doc extended with an optional `receipt: { gDriveFileId, gDriveWebViewLink }`. `getCachedReceipt` now returns `{ result, receipt? }` (`CachedReceipt`); `saveCachedReceipt` takes an optional 4th `receipt` arg (undefined stripped).
- `readReceipt` split: the cache read/store moved up into `handlePhoto`; the leftover `extractFresh` is just the vision call + error wrapping.
- `handlePhoto`: on a **cache hit**, reuse `cached.receipt` and SKIP `uploadReceiptForUser`; if the cached entry has no upload info (older entry / prior upload failed), upload once and back-fill the cache. On a **cache miss**, unchanged parallel `Promise.all([extractFresh, upload])`, then store read + upload together. `stripForCache` kept.

**Covering tests** (`flow-write.test.ts`): new — second identical photo with a cached upload → `uploadReceiptForUser` NOT called, draft still carries `{gDriveFileId:'f1', gDriveWebViewLink:'https://drive/f1'}`. New — cached read without `receipt` → uploads once and calls `saveCachedReceipt` with the upload. Existing cache/quota/Drive-not-linked cases updated to the `{result,...}` shape and green.

**Result:** pass.

---

## MINOR — WA stale placeholder on error

**Files:** `src/app/api/bot/whatsapp/route.ts`, `src/app/api/bot/whatsapp-message.test.ts`

**Change:** in `processMessage`'s `catch`, if `placeholderId` is set, `editMessage(chat_id, placeholderId, errorReply)` instead of `sendMessage` — the "📸 Struk diterima…" bubble becomes the error rather than being stranded above a fresh one. Text messages (no placeholder) still `sendMessage`.

**Covering test:** the media-download-failure case now asserts a `/message/ph1/update` call whose body message contains "masalah", and that the error is NOT also re-sent via `/send/message`.

**Result:** pass.

---

## MINOR — card shows `×1` for receipt lines

**Files:** `src/shared/bot/replies.ts` (`renderLine`), `src/shared/bot/replies.test.ts`

**Change:** guard `line.quantity && line.quantity > 1` → `line.quantity != null`. A receipt line (has a `quantity` field) shows `×${quantity}` including `×1`; a text line (no `quantity`) shows nothing. Matches §5 of the plan.

**Covering test:** new `batchReview` case — line `quantity: 1` → `Nasi goreng</i> ×1`; `quantity: 3` → `×3`; `quantity: undefined` → no `×`.

**Result:** pass.

---

## MINOR — untested admin-data query wrappers

**File:** `src/shared/bot/admin-data.test.ts`

**Change:** new cases following the file's per-test inline `getAdminDb` mock style:
- `getTransactionsBetween` — asserts the `where('date','>=')` / `where('date','<')` / `orderBy('date','desc')` chain and `{id, ...data}` mapping.
- `searchTransactions` — asserts it fetches `scanLimit` (`limit(500)`), filters `description` case-insensitively for the needle, slices to `limit` (2), and returns `[]` for a blank needle without touching Firestore.

**Result:** pass.

---

## Commit

`fix(bot): final-review findings — segment split, undo month-lock, model-call guard, receipt-upload cache`
Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

12 files (6 source, 6 test). No refactor beyond the listed items.
