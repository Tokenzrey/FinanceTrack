# Task 7 report — structured review card & timestamped confirmations

**Status:** complete
**Commit:** `57b67f5` on `feat/bot-multi-transaksi` (parent `5d1bd59`)

## What shipped

`src/shared/bot/replies.ts`
- New imports: `formatDateTime`, `batchTotals`/`collapseToSingle` (`./draft`), `reviewToken` (`./review-commands`), `DraftBatch`/`DraftLine` types.
- Helpers above `export const replies`: `TYPE_MARK`, `TYPE_LABEL`, `padAmount`, `amountColumnWidth`, `renderLine`, `sameDay` — plus one extra helper `idr()` (see deviations).
- New reply fns: `batchReview`, `batchSaved`, `batchCancelled`, `batchEmpty`, `reviewHelp`, `reviewUnknownCommand`, `reviewLineFocus`, `reviewInvalidLine`, `reviewNeedsCategory`, `busyReviewing`.
- `transactionRecorded` signature changed to `(amount, categoryName, receiptStatus, date, tz)` — now stamps `formatDateTime(date, tz)` instead of the literal "Hari ini", and gained a `/undo` line.

`src/shared/bot/core.ts` (controller-authorised call-site fix)
- `finalizeTransaction`: added `const tz = await adminData.getUserTimezone(userId)` and passes `new Date(draft.dateIso), tz` to `transactionRecorded`. Bridge until Task 9 deletes `finalizeTransaction`.

`src/shared/bot/replies.test.ts` — brief's Step 1 block added (19 new `it`s); the two existing `transactionRecorded` cases updated to the 5-arg form.

`src/shared/bot/core.test.ts` — consequence of the authorised core.ts change, minimal:
- `./admin-data` mock gained `getUserTimezone: async () => 'Asia/Jakarta'` (6 tests hit `finalizeTransaction` and threw "no export on mock" without it).
- one assertion `'struk tersimpan ke drive'` → `'...ke google drive'` to track the brief's reworded receipt note.

## Deviations from the brief (all forced, all noted)

1. **`idr()` wrapper.** In this runtime `formatIDR` (Intl `id-ID` currency) puts a **non-breaking space** (U+00A0) between "Rp" and the number, so the brief's `toContain('Rp 35.000')` / §5's plain-space depiction would never match. Added `function idr(v) { return formatIDR(v).replace(/ /g, ' ') }` and used it everywhere Task 7 renders an amount. Zero behaviour change beyond the space; `formatIDR` itself untouched (out of scope, would ripple to web UI + other tests).
2. **`padAmount` body.** Brief's literal `formatIDR(value).padStart(width)` right-pads the *whole* string → `   Rp 59.000`. §5 (and shared-context §5, which `batchReview` "must match") shows `Rp    59.000` — mark flush-left, digits right-aligned. Step 5 explicitly says "fix spacing if off", so `padAmount` now splits on the first space and pads only the digit run. Output now matches §5 byte-for-byte. No test asserts the column, so this is safe either way.
3. **Test import `batchTotals` from `./draft`** — brief lists it but never uses it; omitted (would trip `@typescript-eslint/no-unused-vars` under `next lint`).
4. **`×1` on quantity-1 lines** — §5's line 1 shows `×1`; the brief's `renderLine` deliberately guards `quantity > 1` (its own comment). Kept the brief code; "×1" is noise. Card otherwise matches §5.

## Step 5 (WhatsApp render check)

Ran a throwaway `src/shared/bot/__wa_preview.test.ts` rendering `batchReview` + `batchSaved` through `renderForWhatsApp`, eyeballed against shared-context §5: header/blockquote/numbered body/totals column/warnings/hints all line up, no leaked tags, no `&amp;`. Fixed the totals-column spacing (deviation 2), then deleted the preview file before committing.

## Gates

- `npx vitest run src/shared/bot/replies.test.ts` → **49 passed**
- `npx vitest run` → **473 passed / 0 failed** (30 files). Baseline was quoted as 455; +18 net (19 new in replies.test.ts, and the +1/-1 wash is within the stale baseline figure — nothing was removed or skipped).
- `npx tsc --noEmit` → clean (exit 0)
- `npx next lint --dir src` → "No ESLint warnings or errors"
- All `batchReview` keyboard tokens ≤ 64 bytes (asserted).

## Concerns

- The whole-suite count is 473, not `455 + 19 = 474`; the "455" baseline in the task note looks slightly stale (progress.md's post-Task-6 figure). Suite is fully green with nothing skipped, so this is a bookkeeping note, not a regression.
- `core.test.ts` was touched though the brief scoped only `replies.*`. Both edits are the unavoidable fallout of the controller-authorised `transactionRecorded` signature change (mock stub + reworded-copy assertion). Task 9 removes `finalizeTransaction` and can drop the `getUserTimezone` stub then.
- `idr()` normalisation lives only in `replies.ts`. If any other bot reply is later compared byte-exact against `formatIDR` output, it'll hit the same NBSP surprise — the real fix (normalising in `format.ts`) was out of scope here.
