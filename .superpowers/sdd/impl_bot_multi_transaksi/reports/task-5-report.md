# Task 5 Report — Caption as extraction context

**Status:** DONE
**Commit:** `76aab78` on `feat/bot-multi-transaksi` (parent `72d2bc1`)

## What changed

### `src/shared/lib/receipt-extraction.ts`
- Added `MAX_USER_NOTE_CHARS = 500` and `userNoteBlock(userNote?: string)` helper just above `EXTRACTION_PROMPT`. Trims the caption, returns `''` when empty/whitespace, otherwise an Indonesian "Catatan dari pengguna…" block with the note sliced to 500 chars.
- `buildMappingPrompt` gained an optional 5th param `userNote?: string`; `${userNoteBlock(userNote)}` is spliced in immediately before the `Aturan mapping:` line.
- `extractReceipt` gained an optional 5th param `userNote?: string` (documented). Threaded into:
  - the `generateWithRouter('vision', …)` call — `contents[0].text` is now `` `${EXTRACTION_PROMPT}${userNoteBlock(userNote)}` ``.
  - the `generateWithRouter('text', …)` mapping call — `buildMappingPrompt(…, hints, userNote)`.

### `src/shared/bot/flow-write.ts`
- `handlePhoto` now calls `extractReceipt(…, [], msg.caption)` (5th arg restored; Task 9 had dropped it). Stale "deferred task / still 4 args" comment replaced.

### Tests
- `receipt-extraction.test.ts` — 5 new cases in `describe('extractReceipt')`: caption injected into extraction prompt; into mapping prompt; absent when no caption; ignored when whitespace-only; truncated at 500 chars. Assertions read `generateWithRouter.mock.calls[0][1].contents[0].text` (vision) and `…calls[1][1].contents` (mapping string), per the Task 12 router mock. `extractionResult()` helper and mock setup untouched.
- `flow-write.test.ts` — 1 new case in `describe('handlePhoto')`: captioned photo → `extractReceipt.mock.calls[0][4]` equals the caption. Existing `photo(caption?)` helper already supported the param; no fixture change needed.

## Gates
- `npx vitest run src/shared/lib/receipt-extraction.test.ts src/shared/bot/flow-write.test.ts` → 32 passed.
- `npx vitest run` → 507 passed / 33 files (was 501; +6 new).
- `npx tsc --noEmit` → clean.
- `npx next lint --dir src` → clean.

## Concerns
- None. The 5th param is optional; `src/app/api/ai/scan-receipt/route.ts` still calls with 4 args and compiles unchanged.
