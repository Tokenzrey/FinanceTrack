# Adversarial review — THE NEW HIRE

Repo `d:/Documents/code/web/FinanceBot/Finance-FE`, branch `feat/bot-multi-transaksi`, range `b07bde8..57ee303` (18 commits). Suite 604 green.

Persona premise: I joined today. In 6 months I must safely change this code with zero access to whoever wrote it. Every finding below is a place where the code *works now* but a reasonable future edit — made by someone reading only what is on the page — silently breaks a money-correctness rule, or wastes hours tracing intent that was never written down.

Counts: **1 CRITICAL / 6 WARNING / 6 NOTE**

---

## CRITICAL

### C1 — `draft.ts:133` `collapseToSingle` sums lines of different `type` into one amount
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/bot/draft.ts:133-151`, reached via `batchToDTOs` single branch (`draft.ts:164`) ← `flow-review.ts:127` `commit` ← `set_mode` (`review-commands.ts:115-116`, `flow-review.ts:127-128`).

```ts
export function collapseToSingle(batch: DraftBatch): DraftLine {
  const amount = batch.lines.reduce((total, l) => total + l.amount, 0)   // <-- every line, any type
  const heaviest = [...batch.lines].sort((a, b) => b.amount - a.amount)[0]
  return { ...heaviest, n: 1, amount, description, quantity: null }
}
```

A receipt batch is all-`expense` at birth, but the review card documents `tipe 1 masuk` / `tipe 1 transfer` (see `replies.ts:748`, `reviewLineFocus` type buttons) **and** `gabung`. Nothing stops a user marking a cashback/refund line on a receipt as `income` and then typing `gabung`. Result: one transaction whose `amount` is `expense + income` summed, whose `type`/`pillar` is just the heaviest line's. A 200rb grocery run with a 5jt refund line becomes a single **Rp 5.200.000** transaction of whichever type won the sort. The user sees one plausible number on the card and taps save.

Why a newcomer ships this unchanged: the function name says "collapse to single", the only comment says "Category follows the highest-value line, since that is what the combined transaction mostly *is*" — nothing says "all lines must share a type" or "do not offer merge on a mixed-type batch". `set_mode` in `flow-review.ts:127` applies with zero validation. No test mixes types then merges, so the suite stays green.

**Fix:** in `applyCommand`'s `set_mode` case, reject `mode: 'single'` when `new Set(batch.lines.map(l => l.type)).size > 1` (reply "gabung hanya untuk transaksi sejenis"); or have `collapseToSingle` throw / `batchReview` hide the merge button when types differ.

---

## WARNING

### W1 — `gemini-router.ts` roster: two comments that contradict each other, fictional-looking ids, no test guards them
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/lib/gemini-router.ts:1` says
```
// ROSTER model ids are provisional — verify against scripts/list-gemini-models.mjs output before production use.
```
`gemini-router.ts:47-51` says the opposite:
```
 * Verified against `scripts/list-gemini-models.mjs` output and the account's own rate
 * limit dashboard.
```
`DEFAULT_ROSTER` (`:52-69`) then lists `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` — none of which match any Gemini model id I can find. If they are wrong and `GEMINI_MODELS_VISION`/`GEMINI_MODELS_TEXT` are unset in prod, every call in `generateWithRouter` 404s → `classify` returns `'other'` → `noteFailure` counts it as a use → after `rosterFor(task).length` attempts the loop throws → **every photo and every multi-transaction text fails** until someone deploys env overrides.

`gemini-router.test.ts` never asserts a roster id is real or stable — it feeds `pickModel` synthetic health maps and checks ordering. "text tier leads with rpd≥500" passes with invented ids.

Why a newcomer is stuck: told to "add a new model tier" or "check why receipts fail", they cannot tell from the file whether the roster is trustworthy — one comment says yes, one says no.

**Fix:** delete whichever comment is false; pin real ids; add a test that every `DEFAULT_ROSTER` id matches `/^gemini-[0-9.]+-(flash|flash-lite|pro)$/` and fails loudly when the roster drifts.

### W2 — `gemini-router.ts:178` comment "Set once at startup by `admin-data.ts`" is false
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/lib/gemini-router.ts:178-186`:
```ts
/** Set once at startup by `admin-data.ts`; kept injectable so tests never touch Firestore. */
let io: RouterIO = { load: async () => (...), save: async () => {} }
export function configureRouterIO(next: RouterIO): void { io = next }
```
`admin-data.ts` never calls `configureRouterIO`. The real caller is `core.ts:40-43`, inside `handleIncoming`, **on every inbound message** (comment there: "Idempotent, and done here rather than in `firebase-admin.ts` because wiring it there would create an import cycle").

Why a newcomer misreads it: debugging the quota ledger, they grep `configureRouterIO`, read "startup by admin-data.ts", open `admin-data.ts`, find nothing, and lose the thread. Also a module-global mutated from the hot path leaks between tests unless every suite stubs `getModelHealth`/`saveModelHealth` (today `core.test.ts:78` does — nothing enforces the next one will).

**Fix:** change the comment to "Re-pointed at the Firestore ledger on every `handleIncoming` call (see `core.ts`) — the assignment is idempotent"; consider asserting `io` is only set once per process outside tests.

### W3 — `flow-review.ts:9` docstring "Every write the bot performs now passes through here" is untrue
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/bot/flow-review.ts:9-16`:
```
 * The editable review loop. Every write the bot performs now passes through here, so
 * "confirm before recording" is a property of the system rather than of one code path.
```
`flow-write.ts:53` `commitDirect` writes transactions (`createTransactionsBatch`) with no review card, on both the L0 and L1 fast paths. `flow-write.ts:20-31` even documents that fast path — so the two file headers contradict each other.

Why this bites: the review-loop file is the natural home for a future money-invariant assertion ("no batch may straddle two months", "transfer pillar must not be income"). A newcomer adds it to `commit()` in `flow-review.ts`, trusts the docstring that "every write passes through here", and the fast path silently bypasses the new guard.

**Fix:** "Every write **except the text fast path** (`flow-write.ts` `commitDirect`) passes through here"; or route `commitDirect` through a shared `writeBatch()` helper that both call, and put invariant checks there.

### W4 — `flow-write.ts` L0 fast path ignores `prefs.autoAcceptConfidence`; L1 respects it
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/bot/flow-write.ts:87-93` (L0, local resolver):
```ts
if (localLines) {
  const batch = newBatch({ source: 'text', lines: localLines })
  if (localLines.length === 1 && !prefs.alwaysReview) return commitDirect(userId, batch, categories)
  return startReview(userId, batch)
}
```
`flow-write.ts:119` (L1, model): `if (isFastPath(lines) && topConfidence >= prefs.autoAcceptConfidence && !prefs.alwaysReview)`.

So there are two thresholds for "may I skip the confirmation card": `LOCAL_ACCEPT_CONFIDENCE` (hardcoded `80`, `local-resolver.ts:25`) and `prefs.autoAcceptConfidence` (user-set via `/atur autoaccept`). Only the model path honours the user's setting. A user who runs `/atur autoaccept 95` to be asked more often still gets known phrases ("kopi 20rb", hint confidence 80–94) **auto-written with no card** — and `replies.ts:512` tells them `/atur autoaccept 80` means "makin tinggi, makin sering ditanya dulu" (higher = asked first more often), which is simply false for the L0 path.

Why a newcomer misreads it: nothing in `flow-write.ts` says the two paths have different gates; `handleTextTransaction` reads top-to-bottom as one policy.

**Fix:** gate L0 the same way — `if (localLines.length === 1 && !prefs.alwaysReview && localLines[0].__confidence >= prefs.autoAcceptConfidence)` (thread the `LocalMatch.confidence` through), or state in a comment why L0 is deliberately exempt.

### W5 — `parse-intent.ts:43-133` is ~90 lines of dead code modelling the pre-router Gemini pattern
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/bot/parse-intent.ts`: `schema`, `buildPrompt`, `normaliseConfidence`, `FALLBACK`, and `parseIntent` (`:104`) have no callers anywhere in `src` (only `matchReadCommand` is imported — by `core.ts:23`). `parseIntent` still uses `new GoogleGenAI({ apiKey })` directly (`:109`) and `const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'` (`:5`) — it bypasses `gemini-router.ts`, the quota ledger, and the roster entirely. Task-9's own report notes the *import* was removed from `core.ts` but the function was left in place.

Why a newcomer wastes a day: the file is named `parse-intent.ts`; its only live export is a keyword matcher, not a parser. Asked to "route intent detection through the router" or "add a model tier", they find `parseIntent` — the most detailed "how we call Gemini for text" example in the tree — and edit dead code, or worse, wire it back in against the router's quota accounting.

**Fix:** delete `parseIntent`, `schema`, `buildPrompt`, `normaliseConfidence`, `FALLBACK`, and `ParsedIntent` in `types.ts:141`; rename the file to `read-commands.ts`.

### W6 — two money-column helpers with different non-breaking-space handling
`d:/Documents/code/web/FinanceBot/Finance-FE/src/shared/bot/replies.ts:36` `idr()` strips the `id-ID` NBSP:
```ts
function idr(value: number): string { return formatIDR(value).replace(/\u00A0/g, ' ') }
```
`replies.ts:55` `padAmount` + `replies.ts:63` `amountColumnWidth` build columns from `idr()` (plain space). `render.ts:37` `moneyColumn` builds columns from raw `formatIDR()` — **NBSP intact** — and pads with a plain space. `replies.summary` (`replies.ts:235`) uses `moneyColumn`; `replies.batchReview` totals (`replies.ts:627-640`) and `replies.periodSummary` (`replies.ts:540`) use `padAmount`/`idr`. So the bot ships both conventions, sometimes in the same message.

Why a newcomer breaks alignment: told "add a totals block to `/statistik`", they pick one of the two helpers by coin flip. Mixing them in one `<code>` block misaligns the column (one set measured on NBSP strings, one on stripped strings). The `replies.ts:35` comment ("byte-exact tests both want a plain one") only covers the `idr()` side; `render.test.ts:34` only checks `moneyColumn` against itself. Nothing tells the reader there are two, or which is canonical.

**Fix:** delete `padAmount`/`amountColumnWidth`, make `moneyColumn` call `idr()` internally, and route every column through it.

---

## NOTE

### N1 — `admin-data.ts:275` `isBudgetClosedAdmin` hand-copies `month-lock.ts` with only a "keep in sync" plea
`src/shared/bot/admin-data.ts:272-277`. The comment says "Mirrors the boolean rule in `month-lock.ts` (`Boolean(budget?.closedAt)`) … Keep both in sync if the closed-month rule ever changes." A future change to month-lock semantics (grace period, per-pillar lock) silently won't reach the bot. The bot path can't import `month-lock.ts` (client SDK), but it *could* import a shared pure predicate. **Fix:** extract `isMonthClosed(budget)` to a SDK-free module both import.

### N2 — "amounts never from the model" is a text-path-only invariant, stated as absolute
`src/shared/bot/parse-amount.ts:1-6` ("A misread amount is the single most expensive… Gemini only ever handles what's genuinely fuzzy: intent and category"). But `draft.ts:104` `buildLinesFromReceipt` takes `amount: Math.round(item.totalPrice)` straight from `extraction` — the model's OCR number, no deterministic re-parse. The receipt path's safety net is the mandatory review card, not `parseAmount`. Nothing states this split. **Fix:** add to `parse-amount.ts` "receipt line amounts come from the vision model and are guarded instead by the always-on review card (`flow-write.ts` `handlePhoto`)".

### N3 — `batchToDTOs` "pillar follows category" enforced only by upstream option-scoping
`src/shared/bot/draft.ts:162-179`, line 171: `pillar: pillarOf(line, pillars) ?? inferPillar(line.type)`. A `transfer` line can only hold a non-income category *today* because `retypeLine`/`buildOptions` scope the options. `batchToDTOs` itself never re-checks that `line.type` and `category.pillar` agree. A future edit path that sets `categoryId` without going through `buildOptions` can write `type: 'transfer', pillar: 'income'`, which `buildMonthlySummary` then counts as income. **Fix:** assert in `batchToDTOs` that a non-income line's category pillar is not `income`.

### N4 — `commitDirect` silently assumes exactly one categorised line
`src/shared/bot/flow-write.ts:53-72`. Line 71 reads `dtos[0].amount` but `batch.lines[0].categoryName`. Aligned only because both current callers pre-check `length === 1` / `isFastPath`. The name, signature, and comment give a third caller no hint. **Fix:** `if (dtos.length !== 1) throw` at the top, or take the single `DraftLine` as the parameter instead of the batch.

### N5 — `core.ts:85` builds user-facing HTML inline, bypassing `replies.ts`
`src/shared/bot/core.ts:84-92` appends a hand-written `<i>ℹ️ Masih ada ${pending.lines.length} transaksi menunggu…</i>` string in the dispatcher. `replies.ts:11` says it holds "Every text the bot ever sends, in one place", and `replies.ts:812` `busyReviewing` already says nearly the same thing. A newcomer updating review-prompt copy edits `replies.ts` and misses this. **Fix:** move the suffix into a `replies.readCommandDuringReview(answer, count)` helper.

### N6 — `local-resolver.ts:53` `SEGMENT_SPLIT` is the hardest line in the write path to modify safely
`src/shared/bot/local-resolver.ts:53`: `/(?<!\d)\s*[,;]\s*|\s*[,;]\s*(?!\d)|\n+|\s+dan\s+/gi` — four alternations, two lookarounds, and a money-correctness job (a wrong split rewrites an amount). The prose comment above it is good, but the regex has no worked examples inline and no named-group structure. **Fix:** build it from named sub-patterns (`SEP`, `THOUSANDS_GUARD`, …) with a comment table of the exact strings each branch is meant to catch/spare, mirroring `local-resolver.test.ts:96-112`.

---

## Single most likely point of newcomer confusion

**W5 + W1 together.** A newcomer told to touch "how the bot calls Gemini for text" opens `parse-intent.ts`, finds the fully-fleshed `parseIntent` with its schema and prompt, and reasonably concludes that is the live path — when the live path is `parse-batch.ts` → `gemini-router.ts`, and `gemini-router.ts`'s own header can't decide whether its model list is verified or provisional. The one file that looks authoritative is dead; the one that is authoritative disclaims itself.
