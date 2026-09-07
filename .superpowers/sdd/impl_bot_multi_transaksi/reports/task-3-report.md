# Task 3 Report: Parser Perintah Tinjauan

**Status:** DONE
**Commit:** `e8b4279` on `feat/bot-multi-transaksi` (parent `09b6fd2`)

## What was built
- `src/shared/bot/types.ts` — appended the full `ReviewCommand` union (brief's version, with `focus`). Nothing removed.
- `src/shared/bot/review-commands.ts` (new) — `parseReviewCommand(raw, now)`, `reviewToken(cmd)`, `REVIEW_TOKEN_PREFIX = 'rv:'`. Pure module, no I/O, no Gemini. Consumes `parseAmount` for amount edits. Typed commands and `rv:*` callback tokens flow through one function; date words keep the clock from `now`; line numbers bounded 1..99; malformed input returns `{ kind: 'none' }` rather than throwing.
- `src/shared/bot/review-commands.test.ts` (new) — brief's test cases verbatim.

## TDD trail
1. Wrote test → FAIL (`Failed to resolve import "./review-commands"`).
2. Wrote implementation from brief's code block verbatim.
3. Test → PASS.

## Gates (all green)
- `npx vitest run src/shared/bot/review-commands.test.ts` → 20 passed (brief estimated 17; actual `it()` count is 20).
- `npx vitest run` → 435 passed / 29 files (was 415; +20 new).
- `npx tsc --noEmit` → clean (exit 0).
- `npx next lint --dir src` → no warnings or errors.
- `reviewToken` round-trips every button-form command; longest token (`rv:cat:99:99`) is 12 bytes, well under the 64-byte cap the tests assert.

## Concerns
None. Implementation is the brief's code as written. CRLF line-ending warnings from git on the new files are cosmetic (repo-wide autocrlf), no action needed.
