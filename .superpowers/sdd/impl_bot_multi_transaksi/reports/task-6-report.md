# Task 6 report — Persistensi Batch, Tulis Massal, Zona Waktu

**Status:** DONE
**Commit:** `5d1bd59` (`feat(bot): atomic batch writes, timezone lookup, undo memory`)

## What changed
- `src/shared/bot/admin-data.ts`
  - Import `DraftBatch` from `./types`; `BotPendingDraft` widened to include it; `setPending` param widened.
  - `KNOWN_PENDING_KINDS = {transaction_batch, goal_contribution, category_confirm}` (controller ruling — kept `category_confirm` so `core.ts` + its tests stay green).
  - `getPending` now drops any unknown `pendingKind` (TTL check + return shape unchanged). Kept the pre-`pendingKind` → `category_confirm` defaulting so the existing backward-compat test stays green.
  - New: `createTransactionsBatch`, `deleteTransactions`, `rememberLastBatch` / `getLastBatch` / `clearLastBatch`, `getUserTimezone`. New local consts `MAX_BATCH_WRITES = 400`, helper `transactionPayload`.
  - `createTransaction` refactored to share `transactionPayload` — written shape byte-identical, existing tests untouched.
- `src/shared/bot/admin-data.test.ts` — new `describe('multi-transaction persistence')` block with a small shared harness (`docData`/`docExists` + batch/doc spies); existing per-test mocks untouched. Brief's "legacy drafts" test fed a fabricated `pendingKind: 'bogus_v0'` per the ruling.
- `src/shared/bot/core.ts` — **out-of-brief but required for the `tsc` gate.** Widening `BotPendingDraft` broke narrowing in `handlePendingReply` (`.options`/`.draft` on the un-narrowed union). Added a 4-line guard: on `pendingKind === 'transaction_batch'`, clear pending and reprocess as fresh text. Task 8 replaces this with the real `flow-review` dispatch.

## Gates
- `npx vitest run src/shared/bot/admin-data.test.ts` → 28 passed (18 existing + 10 new).
- `npx vitest run` → 455 passed / 30 files (was 444, +11).
- `npx tsc --noEmit` → clean.
- `npx next lint --dir src` → clean.

## Concerns
- **`core.ts` touched** (3rd file in the commit). Unavoidable: brief's `BotPendingDraft` widening + `tsc` gate. Guard is temporary; Task 8 owns the real dispatch.
- Commit message is the brief's verbatim text; its middle paragraph says a legacy `category_confirm` doc is dropped, which the controller ruling reverses (`category_confirm` is now a known kind). Prose-only mismatch; instruction was "brief's exact message".
- `getLastBatch` returns `createdAt: Timestamp.now()` fallback when the stored field is missing — harmless, matches brief.
