# Whole-branch review — `feat/bot-multi-transaksi` (`b07bde8..7c338fd`)

Scope: correctness + integration defects only. Suite 590/590, tsc 0, lint clean (not re-run).

Counts: **1 critical / 2 important / 6 minor**, plus deferred-list triage.

---

## CRITICAL

### C1. `splitSegments` fails to split comma-separated plain-number amounts → silent transaction loss on the auto-commit path
`src/shared/bot/local-resolver.ts:56` (`SEGMENT_SPLIT`)

The single split alternative is `(?<!\d)\s*[,;]\s*(?!\d)`. The `(?<!\d)` / `(?!\d)` guards are meant to protect a decimal/thousands comma (`1,5jt`, `1,250,000`), but they also fire whenever a digit merely *abuts* the separator across a space — which is every plain-rupiah amount followed by `", "`.

Inputs → wrong output:
- `"kopi 20000, teh 5000"` (or `"jajan 100.000, bensin 50.000"`): comma is preceded by `0` → **not split** → one segment.
- `tryLocalBatch` runs `parseAmount("kopi 20000, teh 5000")` → `20000` (the max), `resolveLocally` hits the `kopi` hint / a `Jajan` category name with confidence ≥ 80.
- Returns a **single** `DraftLine`, so `handleTextTransaction` (flow-write.ts:88) takes `localLines.length === 1 && !prefs.alwaysReview` → `commitDirect` — **auto-commits `20000` to one category and silently drops `teh 5000`**, no review card, no warning. User sees only `Tercatat Rp20.000`.

Shorthand amounts (`20rb, 5rb`) split fine — the hole is exactly the plain/dotted digit form, which Indonesian users type constantly. `local-resolver.test.ts` only asserts the *don't-split-inside-a-number* direction (18/18); the *fails-to-split-a-real-boundary* case is untested.

Fix: only suppress the split when digits are on **both** immediate sides with no whitespace, e.g. `/(?<!\d)\s*[,;]\s*|\s*[,;]\s*(?!\d)|\n+|\s+dan\s+/gi` — keeps `1,5jt` / `1,250,000` / `1.500,00` intact, splits `20000, teh` and `100.000, bensin`. All 18 existing tests stay green; add one for `"kopi 20000, teh 5000"`.

---

## IMPORTANT

### I1. No "has an amount at all" pre-check before the L1 model call → every stray chat message burns a Gemini text-tier request
`src/shared/bot/flow-write.ts:90-101` (`handleTextTransaction`)

The removed `handleText` in `core.ts` did `if (parseAmount(trimmed) === null) return replies.amountNotFound()` *before* calling the model. The replacement calls `parseTransactionBatch(text, active)` for any non-command text and only checks `lines.length === 0` afterwards.

Inputs → wrong output: `"halo"`, `"makasih"`, `"kok lama"`, `"8"`, or `"cari kopi"` (no slash — `parseCommandArgs` rejects multi-word non-slash input, so it falls through to here) each fire one `generateContent` against the 2×500/day text pool, `noteSuccess` increments the ledger, then the user gets `amountNotFound` anyway. A chatty user drains the text roster on messages that were never transactions. Contradicts the branch's whole quota-conservation premise (and the bot-webhook-constraints memo).

Fix: after `tryLocalBatch` returns null, add `if (parseAmount(text) === null) return replies.amountNotFound()`. `parseAmount` returns non-null for any multi-transaction message with ≥1 parseable amount, so batches are unaffected.

### I2. `/undo` deletes from a month-locked budget; `commit`/`commitDirect` refuse to write into one
`src/shared/bot/core.ts:484-490` (`handleUndo`)

`commit` (flow-review.ts:70-82) and `commitDirect` (flow-write.ts:56-60) both gate on `isBudgetClosedAdmin` per distinct month before writing. `handleUndo` calls `deleteTransactions(userId, last.transactionIds)` with no such check, so a batch whose month was locked after it was committed can still be fully deleted by `/undo`, mutating a closed month the rest of the system treats as immutable.

Fix: in `handleUndo`, load the budget for each distinct month in `last.transactionIds` (or store the batch's months alongside the ids in `rememberLastBatch`) and return `replies.monthClosed(...)` if any is closed, before deleting.

---

## MINOR

- **M1. `isFastPath` confidence reads the wrong parsed entry.** `flow-write.ts:104` uses `topConfidence = parsed[0]?.confidence` but `lines` may have had earlier `parsed` entries dropped by `buildLinesFromParsed` for an unparseable `amountText`. If `parsed[0]` is dropped and `parsed[1]` survives *with* a category, the auto-accept gate compares `parsed[0]`'s confidence against the line actually committed. Needs the model to both misfire on an amount and invert its confidences, and the result is one wrong-category expense the user can `/undo` — but it is an auto-commit keyed on the wrong number. Fix: carry each surviving line's own confidence and test that.

- **M2. `set_mode: 'single'` on a mixed-type text batch produces a nonsense combined transaction.** `flow-review.ts:applyCommand` `set_mode` has no source/type guard, and `collapseToSingle` (draft.ts:118) sums **all** lines regardless of type and takes the heaviest line's type. Typing `gabung` while reviewing `"gaji 5jt, makan 35rb"` yields one `income` of `5,035,000`. It re-renders before `ok` so it is not silent, and the keyboard only offers the button for `source: 'receipt'`. Fix: reject `set_mode single` unless `source === 'receipt'` (or all lines share a type).

- **M3. `/riwayat 0` throws.** `core.ts:326` `limit = Math.min(20, Number("0")) = 0` → `getRecentTransactions(userId, 0)` → Firestore `.limit(0)` rejects → generic error. Clamp to `Math.max(1, …)`.

- **M4. Month bucketing on the write path uses server-UTC date getters.** `flow-review.ts:76` / `flow-write.ts:58` call `dto.date.getFullYear()/getMonth()` (non-UTC → UTC on Vercel) while the branch added `getUserTimezone` everywhere else. A transaction logged at e.g. 01:00 WIB on the 1st (18:00 UTC on the last) locks/records against the previous month. Partly pre-existing, but the branch had the tz plumbing to fix it.

- **M5. Text-tier router gives up under mild concurrency.** `pickModel` (gemini-router.ts:99) returns null when every model is merely inside its RPM window, and `generateWithRouter` then `break`s and throws — no short wait, no last-resort pick. Three near-simultaneous text calls (2 flash-lite models, 15 rpm → 4 s gap) → the third throws → user gets `aiUnavailable`. Consider a single bounded sleep on the final attempt, or an LRU fallback ignoring the RPM gap.

- **M6. Dead code.** `replies.categoryConfirmPrompt` (replies.ts:186) is unreferenced outside tests now that `resolveCategoryOrAsk` is gone. Harmless; delete with its tests.

---

## Deferred-minors triage (`progress.md` §"DEFERRED MINORS")

- **T7 — `renderLine` hides `x1` quantity.** Defer. Cosmetic, matches how the web card reads.
- **T9 — caption commit-message prose overstates.** Defer. Message text only; behaviour is correct.
- **T11 — `getTransactionsBetween` / `searchTransactions` untested; `BOT_SETUP_CHECKLIST.md` gitignored.** Defer the checklist. Add two thin tests before merge — `searchTransactions` has a real in-memory `.slice`/`.filter` and a `scanLimit` that silently caps results; worth pinning.
- **T15 — cached-receipt path re-uploads to Drive on every retry.** **Fix before merge.** `handlePhoto` puts `uploadReceiptForUser` in the unconditional `Promise.all`, so a GOWA retry (routine — 10 s timeout) or a user re-send produces a **duplicate Drive file** even though the extraction is served from cache. Gate the upload on the `getCachedReceipt` miss, or dedupe by `hashImage`. The `expiresAt` TTL policy is ops config — defer but track.
- **T16 — WA error path leaves a stale placeholder; GOWA response shapes unverified.** Defer the placeholder cosmetics. The unverified shapes (`body.results.message_id`, `/send/file` multipart, `/message/{id}/reaction`, `/send/chat-presence`, `/message/{id}/update`) are all best-effort and fail safe (placeholder/edit/reaction just no-op), so not a merge blocker — but edit-in-place and document send on WhatsApp are effectively untested against live GOWA; verify once on a real instance.
- **T12 — `DEFAULT_ROSTER` model ids provisional.** **Blocker — verify before merge.** If ids like `gemini-3.5-flash` / `gemini-3.8-flash` / `gemini-3.5-flash-lite` are wrong, every call 404s → `classify` → `'other'` → rotate through the whole tier → throw. Net effect: all text parsing silently degrades to fallback lines and every receipt returns `aiUnavailable`. Run `scripts/list-gemini-models.mjs` with a real key and correct the roster (or the `GEMINI_MODELS_*` env) before shipping.
