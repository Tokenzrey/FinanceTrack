# Task 9 report — Alur Tulis: teks & struk masuk ke batch

Branch `feat/bot-multi-transaksi`. Prior HEAD `b74d527` (491 green).

## What was built

### `src/shared/bot/flow-write.ts` (new)
Brief Step 3 verbatim, with one deviation:

- `handlePhoto` calls `extractReceipt` with **4 args** (no 5th `msg.caption`). Caption
  as extraction context (`userNote`) is a deferred task and `extractReceipt`'s current
  signature is 4-arg. The caption still feeds the one-line fallback's `description`
  (`result.extraction.merchant ?? msg.caption ?? null`). A one-line ponytail comment
  marks this.

Exports: `handleTextTransaction`, `handlePhoto`. Internals: `commitDirect`, `newBatch`,
`isFastPath`, `base64ToBlob`, local `const AUTO_ACCEPT_CONFIDENCE = 60`.

Fast path (text): exactly one line + non-null category + `parsed[0].confidence >= 60`
→ `commitDirect` (batch write, no card). Everything else → `startReview`.
Photo: always `startReview`. Size/MIME rejected before any model call. Quota/overload
→ `aiUnavailable`; other extraction errors → `genericError`. Zero mapped items but a
positive total → single fallback line.

### `src/shared/bot/flow-write.test.ts` (new) — 15 tests, all green
Brief's 16 cases minus **"passes the caption to the extractor as context"** — that
case asserts `extractReceipt.mock.calls[0][4] === caption`, which cannot hold with the
4-arg signature. Removed rather than kept-failing; re-add it with the deferred
`userNote` task.

### `src/shared/bot/core.ts` — slimmed to a dispatcher (281 → deletions)
Deleted:
- `handleText`, `handleImage`, `resolveCategoryOrAsk`, `finalizeTransaction`
- `rankCandidateCategories`, `candidateConfidence`, `base64ToBlob`
- `interface Draft`, `const AUTO_ACCEPT_CONFIDENCE`
- section comments `// ─── Photo messages ───`, `// ─── Shared: category resolution ───`
- imports now unused: whole `@/shared/lib/receipt-extraction` block (`ALLOWED_MIME`,
  `MAX_BASE64_CHARS`, `extractReceipt`, `isAiQuotaOrOverloadError`), `parseIntent` from
  `./parse-intent`, `uploadReceiptForUser` from `./drive-upload`, `MappedReceiptItem`
  type, `type Category` from `@/shared/types/domain` (kept `DEFAULT_PILLAR_CONFIG`)
- `handlePendingReply`: `pending` param narrowed `BotPendingDraft` → `GoalContributionDraft`;
  the `batal` / numeric-pick / fallback tail (the `category_confirm` arm) removed;
  photo-while-pending clear+reprocess and the goal branch kept. `handleImage` call
  sites swapped to `handlePhoto`.

Kept (still used): `parseAmount` (goal-contribution amount step), `matchReadCommand`,
`handleReadCommand`, all read-command / goal / recurring / wishlist / net-worth handlers.

Added:
- `import { handlePhoto, handleTextTransaction } from './flow-write'`
- `dispatchText(userId, text)` helper — the new `handleIncoming` text tail (empty →
  `unknownMessage`, read command → `handleReadCommand`, else → `handleTextTransaction`).
  Extracted because `handleGoalContributionReply`'s "fresh message abandons the draft"
  branch also needs it (it used to call the now-deleted `handleText`).
- `handleIncoming` tail: `image → handlePhoto`; `text → dispatchText`. The
  `getPending`→`transaction_batch` interception, `unlink:*`, `skip_recurring:*`, link
  lookup, `configureRouterIO`, goal-contribution pending path all unchanged.

### `src/shared/bot/admin-data.ts` — `category_confirm` removed fully (ruling)
- deleted `interface CategoryConfirmDraft`
- `BotPendingDraft` union: `(CategoryConfirmDraft | GoalContributionDraft | DraftBatch)`
  → `(GoalContributionDraft | DraftBatch)`
- `setPending` param union narrowed the same way
- `KNOWN_PENDING_KINDS`: dropped `'category_confirm'` → `{'transaction_batch','goal_contribution'}`
- removed the pre-`pendingKind` defaulting line (`raw.pendingKind ? raw : {...raw,
  pendingKind: 'category_confirm'}`); a doc with no/unknown `pendingKind` is now dropped
  by the existing `KNOWN_PENDING_KINDS` guard. Comment updated.

### `src/shared/bot/replies.ts`
1-line doc fix on `aiUnavailable`: stale `see handleImage` → `see handlePhoto`, dropped
the no-longer-true "photo is safe on Drive already" clause.

## Tests removed from `core.test.ts` and why
Whole `describe('handleIncoming — text transactions')` (9 its) and
`describe('handleIncoming — photos')` (8 its) replaced by a 4-it
`describe('handleIncoming — dispatch')`:

| Removed test | Reason |
|---|---|
| auto-records a high-confidence expense without asking | old single-tx `parseIntent`+`finalizeTransaction` path; behaviour now in flow-write.test.ts ("records a single confident line immediately") |
| rejects a message with no parsable amount before ever calling Gemini | `parseAmount` pre-check moved into flow-write ("asks for a number when nothing parses") |
| asks the user to pick a category on low confidence … numeric reply | the `category_confirm` numeric-pick flow — deleted per ruling; superseded by the review card |
| keeps the pending draft alive on an out-of-range numeric reply | `category_confirm` pending flow |
| cancels a pending draft on "batal" | `category_confirm` pending flow |
| abandons a stale pending draft when a fresh message arrives | `category_confirm` pending flow |
| rejects a closed month … records nothing | old path; now flow-write.test.ts ("refuses the fast path into a closed month") |
| never lets an income intent settle on an income-pillar-excluded category | old path; pillar backstop now lives in `draft.ts` (`categoriesFor`, Task 2) and flow-write ("records income … as their own types") |
| photos: all 8 (extract+upload+record, not-a-receipt, drive-not-linked, oversized, 429, generic error, stale-pending-photo) | `describe('handleIncoming — photos')` deleted per brief; receipt behaviour now in flow-write.test.ts |

Kept from that area: **"treats an empty message as unrecognized"** (re-homed into the
dispatch describe, minus the vacuous `parseIntent` assertion).
New dispatch tests: text→`handleTextTransaction` trimmed; image→`handlePhoto`; empty→
`unknownMessage` without dispatch; read command→read handler not `handleTextTransaction`.
`vi.mock('./flow-write')` stubs added; `vi.mock` for `receipt-extraction` + `drive-upload`,
the `receiptResult`/`imageMsg` fixtures, and `createTransaction`/`parseIntent`/`extractReceipt`/
`uploadReceiptForUser` mock fns + their unused type imports removed (core.ts no longer
touches those modules).

### `admin-data.test.ts`
- `getPending — backward compatibility` ("treats a pre-`pendingKind` draft as a category
  confirmation") → rewritten as `getPending — unknown kinds` ("drops a draft with no
  `pendingKind`"): asserts `null` + `delete` called. The defaulting it tested is gone.
- `getPending > returns the draft unchanged while still within its TTL`: fixture had no
  `pendingKind` (relied on the defaulting); given `pendingKind: 'goal_contribution'`.

## Gates
- `npx vitest run src/shared/bot/flow-write.test.ts` → 15 passed
- `npx vitest run` → **494 passed, 32 files, 0 failing**
- `npx tsc --noEmit` → exit 0
- `npx next lint --dir src` → "No ESLint warnings or errors", exit 0
- `npx vitest run src/app/api/bot` → 21 passed (3 files) — route tests still call `handleIncoming` fine

## Concerns
- Caption-to-extractor deferred (as instructed). The brief's exact commit message still
  says "the caption rides along as extraction context" — used verbatim per task rules;
  it's only true of the fallback-line description now.
- `parseAmount` import kept in `core.ts` (brief Step 5 listed it for removal) — it is
  still used by `handleGoalContributionReply`'s `enter_amount` step.
