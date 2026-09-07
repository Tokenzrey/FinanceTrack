# Task 8 Report — Editable Review Loop

**Status:** DONE
**Commit:** `b74d527` (branch `feat/bot-multi-transaksi`, parent `57b67f5`)

## What was done

- **Created `src/shared/bot/flow-review.ts`** verbatim from the brief's Step 3:
  `handleReviewMessage`, `startReview` (exported for Task 9), plus private
  `applyCommand`, `commit`, `retypeLine`, `persistAndRender`, `eligibleCategories`,
  `findLine`, `replaceLine`. Every bot write now routes through one confirmation card;
  a draft is only discarded by `batal` / TTL. Photo mid-review → `busyReviewing`;
  unknown text → `reviewUnknownCommand`; type change re-scopes categories and clears
  the choice.

- **Created `src/shared/bot/flow-review.test.ts`** — the brief's 18 cases exactly
  (mocks `./admin-data`, real `draft`/`replies`/`review-commands`).

- **Wired `core.ts` per the CONTROLLER RULING (not the brief's Step 5 verbatim):**
  - Added `import { handleReviewMessage } from './flow-review'`.
  - `handleIncoming`: `getPending` → `transaction_batch` branch handles read commands
    mid-review (answer + one-line "N transaksi menunggu" reminder; `cancel_pending`
    clears + `batchCancelled`), then dispatches to `handleReviewMessage`.
  - `handlePendingReply`: replaced the Task-6 temporary guard block with
    `return handleReviewMessage(userId, pending, msg)` (now a defensive fallback since
    `handleIncoming` intercepts first).
  - **Left untouched:** `handlePendingReply` type (still `BotPendingDraft`), its
    `goal_contribution` and `category_confirm` branches, and `KNOWN_PENDING_KINDS` in
    `admin-data.ts` (still holds `category_confirm`). `core.ts` still writes
    `category_confirm` drafts via `resolveCategoryOrAsk` — removed in Task 9.
  - No `core.test.ts` change needed: importing `./flow-review` did not break its
    mocks (no `transaction_batch` test exists; `flow-review`'s collaborators are all
    either already-mocked `./admin-data` or side-effect-free real modules).

## Gates

- `npx vitest run src/shared/bot/flow-review.test.ts` → **18/18 pass**
- `npx vitest run` → **491/491 pass** (473 prior + 18 new; whole suite green)
- `npx tsc --noEmit` → **exit 0**
- `npx next lint --dir src` → **No ESLint warnings or errors**

## Concerns

- None blocking. Note: `handlePendingReply`'s `transaction_batch` branch is now
  unreachable in practice (kept as a guard). Task 9 is expected to remove the
  `category_confirm` write path and `KNOWN_PENDING_KINDS` entry.
