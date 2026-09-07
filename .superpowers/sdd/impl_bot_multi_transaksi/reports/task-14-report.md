# Task 14 report

**Status:** DONE
**Commit:** 9281c33

**Tests:** `local-resolver.test.ts` 18 new + flow-write 5 + flow-review 2; targeted run 59 green; full suite 546 green (was 521); `tsc --noEmit` clean; `next lint` clean.

## What changed
- New `src/shared/bot/local-resolver.ts` — `resolveLocally`, `detectType`, `detectDateOffset`, `splitSegments` (digit-flanked lookarounds), `tryLocalBatch` (all-or-nothing), `LocalMatch` type in `types.ts`, `LOCAL_ACCEPT_CONFIDENCE = 80`.
- `admin-data.ts` — `getScanHints` / `saveScanHints` on `users/{uid}/meta/scan_hints`, shared with the web scanner.
- `flow-write.ts` — `handleTextTransaction` now `Promise.all([findCategories, getScanHints, getBotPrefs])`, tries L0 `tryLocalBatch` before L1 `parseTransactionBatch`; auto-accept threshold now `prefs.autoAcceptConfidence`, `prefs.alwaysReview` forces the card; removed local `AUTO_ACCEPT_CONFIDENCE`. `handlePhoto` passes real hints to `extractReceipt` instead of `[]`.
- `flow-review.ts` — `commit()` writes hints from confirmed lines via `applyCorrections` in a try/catch that never rethrows.

## Concerns
None. Category-name matching in L0 means messages literally containing an active category name (e.g. "makan ...") now resolve with zero model calls where they previously hit L1 — intended behavior, covered by existing + new tests.
