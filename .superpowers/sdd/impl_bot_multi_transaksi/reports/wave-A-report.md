# Adversarial review — Wave A (money-correctness core)

Branch `feat/bot-multi-transaksi`, from HEAD `57ee303`. One commit. Gates after:
`npx vitest run` 624/624 green (baseline 604, +20), `npx tsc --noEmit` 0, `npx next lint --dir src` clean.

Files touched (all `src/shared/bot/`): `types.ts`, `draft.ts`, `flow-review.ts`, `flow-write.ts`,
`admin-data.ts`, `local-resolver.ts`, `core.ts`, `replies.ts` + their test files.

---

## M1 [CRITICAL] — `collapseToSingle` sums across `type` (saboteur C2 + newhire C1)

### Change
1. `flow-review.ts` `applyCommand` `case 'set_mode'`: when `cmd.mode === 'single'`, reject
   - `batch.source !== 'receipt'` → new `replies.reviewMergeReceiptOnly()` ("Gabung hanya untuk
     transaksi dari struk…"). Matches the Telegram merge button, which `replies.batchReview`
     already gates to `source === 'receipt'`.
   - `new Set(batch.lines.map(l => l.type)).size > 1` → new `replies.reviewMixedTypesMerge()`
     ("Gabung hanya untuk transaksi sejenis (semua pengeluaran atau semua pemasukan).").
   Both return before `persistAndRender`, so the draft stays itemized.
2. `draft.ts` `collapseToSingle`: `if (batch.lines.length === 0) throw new Error('collapseToSingle: empty batch')`
   at the top (saboteur N1 — future 3rd caller fails loud instead of spreading `undefined`).
3. `flow-review.ts` `commit()`: `savedLines` for `mode === 'single'` is now `[collapseToSingle(claimed)]`
   (the same source `batchToDTOs` uses) instead of spreading `lines[0]` — the confirmation names
   the category actually written (saboteur W3).

With single mode now reachable only for a receipt with a uniform `type`, `collapseToSingle`'s
cross-type sum is unreachable; no change to its arithmetic was needed.

### Covering tests
`flow-review.test.ts`: mixed income+expense `gabung` rejected, draft stays itemized;
typed (non-receipt) `gabung` rejected; receipt all-expense `gabung` still toggles to single;
single-mode `batchSaved` shows the collapsed (heaviest) line's category, not `lines[0]`'s.
`draft.test.ts`: `collapseToSingle` throws on an empty batch; collapsed line carries the
heaviest line's `confidence`.

### Result — done. All green.

---

## M2 [CRITICAL] — `commit()` is not idempotent (saboteur C1)

### Change
- `admin-data.ts`: new `claimPendingForCommit(userId): Promise<BotPendingDraft | null>` — one
  Firestore `runTransaction`: `tx.get(pendingRef)`; missing / expired / non-`transaction_batch`
  → `null` (expired one also `tx.delete`d); otherwise `tx.delete(pendingRef)` and return the
  parsed draft.
- `flow-review.ts` `commit()`: the category-blocking guard, empty-DTO check and month-lock loop
  still run first, on the **passed-in** `batch`, so a rejection leaves the draft intact. Only
  once a write is certain does `commit()` call `claimPendingForCommit`. `null` → new
  `replies.batchAlreadyHandled()` ("✅ Sudah diproses."), no write. The returned batch is what
  `createTransactionsBatch` / hint-learning / `savedLines` use. The trailing `clearPending` is
  removed (the claim already deleted the doc).
- Two concurrent `ok`/Simpan-taps race the transaction: one deletes-and-writes, the other's
  `tx.get` sees no doc → `null` → `batchAlreadyHandled`. A retry after `rememberLastBatch` or
  hint-learning throws re-enters with `getPending` already empty → `dispatchText('ok')` →
  `amountNotFound`, no second write.

### Covering tests
`flow-review.test.ts`: two concurrent `commit()`s on one draft → `createTransactionsBatch`
called exactly once, the loser returns `batchAlreadyHandled`; a `commit()` whose claim returns
`null` → `batchAlreadyHandled`, nothing written / remembered.
`admin-data.test.ts`: `claimPendingForCommit` deletes and returns the batch in one transaction;
second call returns `null`; a `goal_contribution` draft is neither claimed nor deleted.

### Result — done. All green.

---

## M3 [CRITICAL] — fast-path reads confidence from the wrong line (saboteur W4 + newhire W4)

### Change
1. `types.ts`: `DraftLine.confidence: number` — new, non-optional (0-100).
2. Set at every construction site:
   - `draft.ts` `buildLinesFromParsed` → `item.confidence`
   - `draft.ts` `buildLinesFromReceipt` → `item.mappingConfidence || result.totalConfidence`
   - `draft.ts` `collapseToSingle` → `heaviest.confidence`
   - `local-resolver.ts` `tryLocalBatch` → `match.confidence`
   - `flow-write.ts` one-line receipt fallback → `result.totalConfidence`
3. `flow-write.ts` `handleTextTransaction`:
   - L1 fast-path gate is now `isFastPath(lines) && lines[0].confidence >= prefs.autoAcceptConfidence
     && !prefs.alwaysReview`. The `topConfidence = parsed[0]?.confidence` read is deleted —
     `buildLinesFromParsed` drops unparseable segments, so `parsed[0]` could be a line that no
     longer exists.
   - L0 fast-path gate gains `localLines[0].confidence >= prefs.autoAcceptConfidence`, so
     `/atur autoaccept` now governs known phrases too, not only model parses (newhire W4).
4. `replies.ts:512` `/atur` help copy: gate is now consistent across L0 and L1 (higher
   threshold = asked more often), so the existing copy is truthful; left unchanged.

### Covering tests
`draft.test.ts`: `confidence` populated by both builders (per-line for parsed; item mapping vs
read fallback for receipt). `local-resolver.test.ts`: `tryLocalBatch` lines carry `confidence`.
`flow-write.test.ts`: `"bayar 5 orang, makan 50rb"` (line 0 dropped, remaining line conf 35) →
review card, not `commitDirect`; L0 known phrase with `autoAcceptConfidence = 95` and hint
confidence 80 → review card, not commit.

### Result — done. All green.

---

## Cheap notes (`core.ts` / `flow-review.ts`)

| Note | Change | Test | Result |
|---|---|---|---|
| **Sab N4** | `dispatchText`: `if (trimmed.startsWith('rv:')) return replies.reviewExpired()` (new reply "Tinjauan itu sudah tidak aktif…") — a stale `rv:*` token no longer reaches `parseAmount` / a model call. | `core.test.ts`: stale `rv:del:20` → `reviewExpired`, `handleTextTransaction` not called. | done |
| **Sab N5** | `dispatchText`: the args-command gate also admits `command === 'export' \|\| 'ekspor'` with zero args → `handleCommandWithArgs` → `handleExport(userId, <current year/month>)` (`monthFromArgs([])` already yields the current month). | `core.test.ts`: bare `/export` exports current month with a CSV document; bare `/ekspor` likewise; neither falls through to `handleTextTransaction`. | done |
| **Sab N10** | `handleIncoming` mid-review block: `if (readCommand === 'undo') return replies.busyReviewing(pending.lines.length)` — `/undo` mid-review no longer deletes the previous committed batch. | `core.test.ts`: `/undo` with a pending `transaction_batch` → "Selesaikan dulu…", `getLastBatch` / `deleteTransactions` not called. | done |
| **Sab N11** | `applyCommand` `case 'set_category'`: after picking `option`, `if (!categories.some(c => c.id === option.categoryId && c.isActive)) return replies.reviewCategoryGone()` (new reply "Kategori itu sudah tidak ada…") — a category deleted since the card was rendered is refused, not written as a dangling id. `categories` was already loaded in `handleReviewMessage`. | `flow-review.test.ts`: picked option whose category is gone from `findCategories` → `reviewCategoryGone`, `setPending` not called; the existing valid-pick test still re-renders. | done |

---

## Notes for later waves
- `commit()` runs its guards on the passed-in `batch` snapshot and writes the freshly-`claimed`
  one; on the normal save path they are byte-identical (both read the same `botPending` doc).
  A concurrent `setPending` edit landing between core's `getPending` and the claim is an
  accepted, un-covered race (the task's chosen design).
- `collapseToSingle` still contains the cross-`type` sum; it is now unreachable because
  `set_mode: 'single'` is gated to receipt + uniform type. Left as-is per scope.
