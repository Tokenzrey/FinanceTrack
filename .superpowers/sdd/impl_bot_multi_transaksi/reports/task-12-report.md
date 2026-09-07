# Task 12 Report — Router Model Sadar-Kuota (quota-aware Gemini model router)

**Status:** DONE_WITH_CONCERNS (concerns are provisional roster ids + a deferred call site — see §7)
**Commit:** `f7b047132350e68d722aed167a2dfd96d31cc349`
**Branch:** `feat/bot-multi-transaksi`
**Base:** `ad68dcd` (Task 1)

---

## 1. Files created / modified

| Action | Path | Notes |
|--------|------|-------|
| Created | `scripts/list-gemini-models.mjs` | Brief §10.6 was **not present** in the provided materials (brief ends at Step 8; no §10.x anywhere in `.superpowers/`). Reconstructed a minimal equivalent: `ai.models.list({ config: { queryBase: true } })`, prints `id \t supportedActions`, marks rows with `generateContent`. Not run — no live API key in this environment (ruling #2). `node --check` passes. Not linted (`next lint --dir src` only) and not typechecked (`.mjs` outside tsconfig `include`). |
| Created | `src/shared/lib/gemini-router.ts` | Verbatim from brief Step 4, plus the provisional-ids top comment (ruling #2). `DEFAULT_ROSTER` populated with the ids exactly as the brief lists them (6 vision flash @ 20/day, 2 text flash-lite @ 500/day + 1 @ 20/day). Exports `generateWithRouter`, `pickModel`, `noteSuccess`, `noteFailure`, `rosterFor`, `configureRouterIO`, `QUOTA_DAY_TZ`, types `GeminiTask`/`ModelSpec`/`ModelHealth`/`HealthLedger`/`RouterIO`. |
| Created | `src/shared/lib/gemini-router.test.ts` | Verbatim from brief Step 2 (11 tests). |
| Modified | `src/shared/lib/receipt-extraction.ts` | Removed `MODELS`, `generateWithModels`, `withRetry`, `aiErrorStatus`. Inlined the numeric-status check into `isAiQuotaOrOverloadError` (which **stays exported** — `core.ts` imports it; reworded its doc to say so). Both call sites now route: extraction → `generateWithRouter('vision', …)`, mapping → `generateWithRouter('text', …)`. Kept the `GEMINI_API_KEY` guard in `extractReceipt` (a test asserts its exact message; the router is mocked in that test so it can't raise it). Dropped the now-unused `new GoogleGenAI(...)`; `@google/genai` import narrows to `{ Type }`. `buildMappingPrompt` call kept at its **current** 4-arg signature — the brief's snippet passes a 5th `userNote` arg / `userNoteBlock()` from a later task that has not landed. Net −87/+? lines. |
| Modified | `src/shared/lib/receipt-extraction.test.ts` | Swapped the `@google/genai` `GoogleGenAI` mock for `vi.mock('@/shared/lib/gemini-router', …)` exposing `generateWithRouter` (kept a slim `@google/genai` mock for `Type`). `beforeEach` resets `generateWithRouter`. Assertions moved to `generateWithRouter.mock.calls[n]` with `[n][0]` = tier, `[n][1]` = params. Removed 4 tests that exercised deleted internals (`withRetry` single-retry, "does NOT retry a 429", two `MODELS` fall-through tests) — that rotation/back-off behaviour is now covered by `gemini-router.test.ts`. Added the brief's "reads the image on the vision tier and maps categories on the text tier" test, plus one "passes the prompt and image through to the router as contents" test that exercises the `[n][1].contents` shape ruling #4 calls out. |
| Modified | `src/shared/bot/admin-data.ts` | Added `getModelHealth()` / `saveModelHealth(dayKey, models)` on `bot_meta/geminiHealth` (verbatim from brief Step 6, plus a section header). Added `import type { ModelHealth } from '@/shared/lib/gemini-router'` — **type-only**, erased at runtime, so no runtime import edge. |
| Modified | `src/shared/bot/core.ts` | **Circular-import route taken: `core.ts`, not `firebase-admin.ts`** (ruling #3). Added `import { configureRouterIO } from '@/shared/lib/gemini-router'` and, as the **first statement of `handleIncoming`**, `configureRouterIO({ load: adminData.getModelHealth, save: adminData.saveModelHealth })` (idempotent). |
| Modified | `src/shared/bot/core.test.ts` | The existing `vi.mock('./admin-data', …)` enumerates exports explicitly, so it now also stubs `getModelHealth` / `saveModelHealth` (plain async stubs — no core test drives a real router call). +4 lines. |

`src/shared/bot/parse-batch.ts` and `parse-batch.test.ts` were **not touched** (ruling #1 — they do not exist yet; created in a later task already using `generateWithRouter`). `src/shared/lib/firebase-admin.ts` was **not touched** (see §3).

---

## 2. TDD sequence executed

| Step | Command | Result |
|------|---------|--------|
| 3 | `npx vitest run src/shared/lib/gemini-router.test.ts` | FAIL — `Failed to resolve import "./gemini-router"`. As the brief predicts. |
| 5 | `npx vitest run src/shared/lib/gemini-router.test.ts` | PASS — 11/11. |
| 7 | `npx vitest run src/shared/lib/receipt-extraction.test.ts` | PASS — 11/11 after rewire. |
| 7 | `npx vitest run src/shared/bot src/app/api` | FAIL first (`core.test.ts`: `No "getModelHealth" export on the "./admin-data" mock`) → added stubs → PASS 162/162. |
| 8 | `npx vitest run` | PASS — 27 files / 395 tests. |
| 8 | `npx tsc --noEmit` | PASS — exit 0, no output. |
| 8 | `npx next lint --dir src` | PASS — `✔ No ESLint warnings or errors`. |

---

## 3. Circular-import route

**Chosen: the `core.ts` fallback from ruling #3.** The brief's default (import `configureRouterIO` + `getModelHealth`/`saveModelHealth` into `firebase-admin.ts`) would add an import edge `firebase-admin.ts → @/shared/bot/admin-data`, and `admin-data.ts` already imports `getAdminDb` from `firebase-admin.ts` — the exact `firebase-admin → admin-data → firebase-admin` cycle the ruling names, on the most widely-imported module in the bot subsystem. So `configureRouterIO({ load: getModelHealth, save: saveModelHealth })` is the first line of `handleIncoming` in `core.ts` instead. It is idempotent; `core.ts` already imports `* as adminData from './admin-data'`, so no new import was needed there beyond `configureRouterIO`.

Remaining cycle: `gemini-router.ts ⇄ receipt-extraction.ts` (router imports `isAiQuotaOrOverloadError`; receipt-extraction imports `generateWithRouter`). This one is **from the brief itself** and is benign — every imported symbol is referenced only inside a function body, never at module-eval time. `admin-data.ts`'s `ModelHealth` import is `import type`, so it adds no runtime edge. tsc, the full vitest suite, and Next lint all pass with the cycle in place.

---

## 4. Every test — name + result

### `src/shared/lib/gemini-router.test.ts` — 11/11 PASS (new)
| # | Test | Result |
|---|------|--------|
| 1 | pickModel — spreading load > picks the least-used model, not always the first in the roster | PASS |
| 2 | pickModel — spreading load > breaks a usage tie with the oldest lastUsedAt | PASS |
| 3 | pickModel — spreading load > skips a model whose daily quota is spent | PASS |
| 4 | pickModel — spreading load > skips a model still inside its per-minute window instead of waiting for it | PASS |
| 5 | pickModel — spreading load > skips a model parked by a 503 cooldown | PASS |
| 6 | pickModel — spreading load > returns null only when every model in the tier is unavailable | PASS |
| 7 | pickModel — spreading load > keeps the vision and text pools separate | PASS |
| 8 | noteSuccess / noteFailure > counts a success against the daily budget | PASS |
| 9 | noteSuccess / noteFailure > a quota failure parks the model for the rest of the day | PASS |
| 10 | noteSuccess / noteFailure > an overload failure parks the model only briefly | PASS |
| 11 | noteSuccess / noteFailure > an unclassified failure still counts as a use, so a broken model rotates out | PASS |

### `src/shared/lib/receipt-extraction.test.ts` — 11/11 PASS (rewired)
| # | Test | Result |
|---|------|--------|
| 1 | extractReceipt > throws when GEMINI_API_KEY is not configured | PASS |
| 2 | extractReceipt > normalises a 0-1 confidence to 0-100 | PASS |
| 3 | extractReceipt > flags a low-confidence extraction as likely not a receipt, and skips mapping entirely | PASS |
| 4 | extractReceipt > rejects a mapped categoryId the user does not actually own | PASS |
| 5 | extractReceipt > accepts a mapped categoryId that exists in the caller-supplied category list | PASS |
| 6 | extractReceipt > warns when the receipt total does not match the sum of mapped items | PASS |
| 7 | extractReceipt > reads the image on the vision tier and maps categories on the text tier | PASS (new, from brief Step 7) |
| 8 | extractReceipt > passes the prompt and image through to the router as contents | PASS (new — exercises `.mock.calls[n][1].contents`) |
| 9 | isAiQuotaOrOverloadError > is true for a 429 or 503 numeric status | PASS |
| 10 | isAiQuotaOrOverloadError > is true when only the message body carries the signal | PASS |
| 11 | isAiQuotaOrOverloadError > is false for other errors | PASS |

Removed (tested deleted `MODELS`/`withRetry`/`generateWithModels` internals; rotation/back-off now lives in `gemini-router.test.ts`): "retries once on a transient failure, then succeeds", "does NOT retry a 429 on the same model", "falls through to a fallback model when the primary is quota-exhausted (429)", "falls through to a fallback model on a 503 overload too".

### Full suite — `npx vitest run`
**27 test files, 395 tests, all PASS.** Prior counts: Task 1 left the repo at 27 files / ~376 (bot 162 + lib 211 overlap). Delta here: +11 (`gemini-router.test.ts`) and net +0 in `receipt-extraction.test.ts` (−4 removed, +4 added: 2 tier/contents + the file already had 3 `isAiQuotaOrOverloadError` + 6 kept extractReceipt = 11, was 13). No pre-existing test changed behaviour.

---

## 5. Typecheck

`npx tsc --noEmit` → **exit 0**, no diagnostics.

---

## 6. Lint

`npx next lint --dir src` → **`✔ No ESLint warnings or errors`**, exit 0.

---

## 7. Concerns

1. **`DEFAULT_ROSTER` ids are provisional (ruling #2).** `scripts/list-gemini-models.mjs` could not be run here — no live `GEMINI_API_KEY`. The roster holds the ids exactly as the brief lists them (`gemini-3.5-flash`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3-flash`, `gemini-2.5-flash`; `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`). Several of these look ahead of what is currently served. The file's first line flags this; `GEMINI_MODELS_VISION` / `GEMINI_MODELS_TEXT` env overrides (`id:rpd:rpm`, comma-separated) let ops retune without a deploy. **Run the script against the production key and reconcile before shipping.**

2. **Brief §10.6 was missing.** Not in `task-12-brief.md` (ends at Step 8) nor anywhere under `.superpowers/`. `scripts/list-gemini-models.mjs` is a reconstruction from the installed `@google/genai@2.19.0` API surface (`ai.models.list`, `Model.name`, `Model.supportedActions`). It is a dev-only utility — not built, linted, typechecked, or imported by app code. Worth a glance if the original §10.6 text resurfaces.

3. **Second call site (`parse-batch.ts`) deferred (ruling #1).** Only `receipt-extraction.ts` was rewired. The brief's Step 7 also rewires `parse-batch.ts`; that file is created in a later task already calling `generateWithRouter`, so nothing there regresses.

4. **`buildMappingPrompt` signature.** The brief's rewired mapping snippet passes a 5th `userNote` arg and wraps the extraction prompt in `userNoteBlock(userNote)`. Neither exists in the current `receipt-extraction.ts` (a different task adds the user-note feature). Call sites were rewired at the **current** signatures only; when the user-note task lands it will re-touch these two lines.

5. **LF/CRLF.** New files written LF; repo working tree is CRLF (`core.autocrlf=true`). Same pre-existing, cosmetic condition Task 1 noted — commit normalises to LF, `git diff` is clean.

---

## 8. Commit

```
f7b047132350e68d722aed167a2dfd96d31cc349

feat(ai): quota-aware model router across the whole free-tier roster

The free tier meters requests per model per day. This account gets 20/day on each of
six flash models and 500/day on each of two flash-lite models, and a fixed fallback
chain burned the first model every morning while five siblings sat idle — the account
dashboard showed gemini-3.5-flash at 24/20 next to gemini-3.7-flash at 1/20.

The router picks the least-used model in the tier, skips one inside its per-minute
window instead of waiting on it, parks a 429 until tomorrow and a 503 for a minute.
Counters reset on the Pacific day boundary, which is when Google resets them.

Item mapping moves from the vision tier to the text tier: it is pure text, and it was
spending the scarcest quota. That alone doubles daily receipt capacity from 60 to 120.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Files in commit (8): `scripts/list-gemini-models.mjs`, `src/shared/lib/gemini-router.ts`, `src/shared/lib/gemini-router.test.ts`, `src/shared/lib/receipt-extraction.ts`, `src/shared/lib/receipt-extraction.test.ts`, `src/shared/bot/admin-data.ts`, `src/shared/bot/core.ts`, `src/shared/bot/core.test.ts` — +437 / −117. `.superpowers/` left untracked, not committed.
