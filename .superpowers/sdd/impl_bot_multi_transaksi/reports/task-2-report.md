# Task 2 Report — Model Draft Batch

**Status:** DONE_WITH_CONCERNS (only concern: a doc/code count mismatch in the brief, resolved in favour of the code block — see below)
**Commit:** `09b6fd2` on `feat/bot-multi-transaksi` (parent `f7b0471`)

## Files

- **Modified** `src/shared/bot/types.ts` — added `BotTxType`, `DraftLine`, `DraftBatch`, `ParsedLine` verbatim from shared-context §4, inserted between `BotIncoming` and `BotKeyboardButton`. Nothing removed; `BotReply.whatsappHints` (Task 1) untouched.
- **Created** `src/shared/bot/draft.ts` — verbatim from brief Step 4. Exports `MAX_DRAFT_LINES` (20), `renumber`, `buildLinesFromParsed`, `buildLinesFromReceipt`, `batchTotals`, `collapseToSingle`, `batchToDTOs`. All pure; `now` injected.
- **Created** `src/shared/bot/draft.test.ts` — verbatim from brief Step 2.

## Gate 1 — `npx vitest run src/shared/bot/draft.test.ts`

FAIL first (`Failed to resolve import "./draft"`), then PASS after implementation. 20 passed / 20:

| # | describe > it | Result |
|---|---|---|
| 1 | renumber > closes the gap after a middle line is removed | PASS |
| 2 | buildLinesFromParsed > re-parses the amount from the model text instead of trusting a number | PASS |
| 3 | buildLinesFromParsed > shifts the date by dateOffset days | PASS |
| 4 | buildLinesFromParsed > drops a segment whose amountText parses to nothing | PASS |
| 5 | buildLinesFromParsed > keeps income candidates out of an expense line and vice versa | PASS |
| 6 | buildLinesFromParsed > leaves categoryId null and offers fallback options when nothing matches | PASS |
| 7 | buildLinesFromParsed > numbers the lines 1..n in order | PASS |
| 8 | buildLinesFromParsed > caps the batch at MAX_DRAFT_LINES | PASS |
| 9 | buildLinesFromReceipt > makes one line per receipt item, all expense | PASS |
| 10 | buildLinesFromReceipt > uses the receipt date, not today, when the model read one | PASS |
| 11 | buildLinesFromReceipt > falls back to now when the receipt carries no readable date | PASS |
| 12 | buildLinesFromReceipt > carries quantity through and leaves an unmapped item without a category | PASS |
| 13 | batchTotals > sums each type separately and nets income minus expense | PASS |
| 14 | collapseToSingle > sums the lines and takes the highest-value line category | PASS |
| 15 | collapseToSingle > falls back to a joined item list when there is no merchant | PASS |
| 16 | batchToDTOs > emits one DTO per line in itemized mode, tagged "bot" | PASS |
| 17 | batchToDTOs > emits exactly one DTO in single mode | PASS |
| 18 | batchToDTOs > attaches the Drive receipt to every DTO it produces | PASS |
| 19 | batchToDTOs > keeps transfer as its own type rather than folding it into expense | PASS |
| 20 | batchToDTOs > skips a line that still has no category — it can never be written | PASS |

## Gate 2 — `npx vitest run` (full suite)

`Test Files 28 passed (28)` · `Tests 415 passed (415)`. Was 395; +20 from this task, 0 regressions.

## Gate 3 — `npx tsc --noEmit`

Exit 0, no errors.

## Gate 4 — `npx next lint --dir src`

`✔ No ESLint warnings or errors`.

## Reconciliation / concerns

- **Test count:** brief Step 3/5 prose says "18 test", but the brief's Step 2 code block contains 20 `it()` cases. Per task rule "the code blocks are what to write", I wrote the block verbatim → 20 tests, all green. No behavioural disagreement, purely a stale number in the prose.
- **§4 vs brief code:** no name/signature conflicts found. `ParsedLine` has no `n` (§4), `DraftLine` has `n` — brief code and tests both consistent with §4. `batchToDTOs(batch, categories: Category[] = [])` matches the brief signature line's `categories?: Category[]`.
- `git add` emitted CRLF-normalisation warnings (repo default on Windows) — cosmetic, no content impact.
- `.superpowers/` remains untracked (only the 3 task files were staged/committed).
