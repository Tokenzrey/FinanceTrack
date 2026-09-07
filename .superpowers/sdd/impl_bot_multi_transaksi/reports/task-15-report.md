# Task 15 — Cache model results by content hash

**Status:** DONE
**Commit:** a6fe5fe0e6ae5d37aae958bb6daa5809343b0a04

## What shipped
- `src/shared/bot/cache.ts` (new): `hashImage`, `hashParse(text, categoryIds)` (sha256 over normalized message + sorted category ids), `stripForCache` (blanks `extraction.rawText` only).
- `src/shared/bot/admin-data.ts`: `CACHE_TTL_MS` (30d) + `getCachedReceipt`/`saveCachedReceipt` (`users/{uid}/bot_receipt_cache/{hash}`), `getCachedParse`/`saveCachedParse` (`users/{uid}/bot_parse_cache/{hash}`); `expiresAt` via `Timestamp.fromMillis`.
- `src/shared/bot/flow-write.ts`: L0.5 parse-cache lookup/store around `parseTransactionBatch` in `handleTextTransaction`; receipt-cache lookup before `extractReceipt` in `handlePhoto`, store on usable read only. Failures (fallback parse `confidence <= 0`, receipt `totalConfidence < 20` / `total <= 0`, quota error) never written.
- `flow-write.test.ts`: 4 mock stubs + 4 integration tests. `cache.test.ts`: 6 unit tests (brief-exact).

## Tests
`npx vitest run` — 35 files, 556 passed (was 546). `tsc --noEmit` clean. `next lint --dir src` clean.

## Concerns
- Cached receipt path still re-runs `uploadReceiptForUser` (Drive re-upload on GOWA retry) — out of scope for this task, not addressed.
- TTL reaping assumes a Firestore native TTL policy on `expiresAt` for both new collections (same pattern as existing `bot_processed_messages`); no app-side reaper.
