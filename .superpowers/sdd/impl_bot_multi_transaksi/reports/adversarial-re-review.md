# Adversarial re-review — `57ee303..dd198c9` (waves A, B, C.1, C.2)

Scope: verdict per finding by reading the 4 fix commits (`ce50e4b`, `8c979a3`, `662ef79`, `dd198c9`).
Suite 650/650 / tsc 0 / lint clean taken as given (not re-run).

## WAVE A — `ce50e4b`

- **M1 collapseToSingle summed across type** — ADDRESSED. `flow-review.ts` `set_mode` case: `if (cmd.mode === 'single')` rejects `batch.source !== 'receipt'` (`reviewMergeReceiptOnly`) and `new Set(lines.map(l=>l.type)).size > 1` (`reviewMixedTypesMerge`). `draft.ts collapseToSingle` throws `'collapseToSingle: empty batch'` on `lines.length === 0`. `commit()` builds `savedLines = claimed.mode==='single' ? [collapseToSingle(claimed)] : claimed.lines`, the same collapse `batchToDTOs` uses (confirmed in `draft.ts`) — confirmation names the heaviest line's category. All four sub-points verified.
- **M2 commit() not idempotent** — ADDRESSED. `admin-data.claimPendingForCommit` does `runTransaction(tx => { get; if !exists→null; expired→delete+null; kind!=='transaction_batch'→null; delete; return raw })`. `commit()` runs the category-null guard and the month-lock loop on the passed-in `batch` and returns BEFORE `claimPendingForCommit` — a reject leaves the pending doc intact. After the claim, the write, `rememberLastBatch`, hint-learning, `getUserTimezone`, and `savedLines` all read `claimed`, not the stale param. Null/lost-race → `replies.batchAlreadyHandled()`. Trailing `clearPending` deleted.
- **M3 fast-path read parsed[0].confidence** — ADDRESSED. `DraftLine.confidence` non-optional (`types.ts`). Set by `buildLinesFromParsed` (`item.confidence`), `buildLinesFromReceipt` (`item.mappingConfidence || result.totalConfidence`), `tryLocalBatch` (`match.confidence`), `collapseToSingle` (`heaviest.confidence`), and the `handlePhoto` literal (`result.totalConfidence`). L1 gate now `lines[0].confidence >= prefs.autoAcceptConfidence`; L0 gate now `localLines[0].confidence >= prefs.autoAcceptConfidence` too. Both read the built line.
- **Sab N4 stale `rv:*` → reviewExpired** — ADDRESSED. `dispatchText`: `if (trimmed.startsWith('rv:')) return replies.reviewExpired()` before any parse.
- **Sab N5 bare `/export` → current month** — ADDRESSED. `dispatchText` admits `parsed.command === 'export' || 'ekspor'` with zero args; `handleCommandWithArgs` exports `now` month.
- **Sab N10 `/undo` mid-review refused** — ADDRESSED. `core.ts`: `if (readCommand === 'undo') return replies.busyReviewing(pending.lines.length)` while a draft is pending — `getLastBatch`/`deleteTransactions` never called.
- **Sab N11 set_category re-validates option** — ADDRESSED. `set_category` case: `if (!categories.some(c => c.id === option.categoryId && c.isActive)) return replies.reviewCategoryGone()`.

## WAVE B — `8c979a3`

- **Sab W1 getUserTimezone validates tz** — ADDRESSED. `try { new Intl.DateTimeFormat('en-US', { timeZone: trimmed }) } catch { return 'Asia/Jakarta' }`.
- **Sab W2 getPending expiresAt guard** — ADDRESSED. `const ms = raw.expiresAt?.toMillis?.(); if (ms == null || ms < Date.now()) { await clearPending(userId); return null }`.
- **Sab W5 L0 bails on unresolved date phrase** — ADDRESSED. New `hasUnresolvedDateHint` (`UNRESOLVED_DATE_RE.test(seg) && detectDateOffset(seg) === 0`); `tryLocalBatch` returns `null` for any segment that trips it.
- **Sab W6 whole-word `\b` match** — ADDRESSED. `matchesWholeWord` (escaped `\b<word>\b` regex) replaces `String.includes` in both name and head loops of `resolveLocally`. "makan siang 35rb" still resolves to `c-food` via the head "makan" (test covers it); "makanan kucing" no longer matches.
- **Sab W7 receiptDate post-check** — ADDRESSED. After `setUTCFullYear(y, m-1, d)`: `if (dated.getUTCFullYear()!==y || getUTCMonth()!==m-1 || getUTCDate()!==d) return now`.
- **Sab W8 `/riwayat 0` clamp** — ADDRESSED. `Math.min(20, Math.max(1, Number(...)))`.
- **Sab W10 Telegram edit→send fallback** — ADDRESSED. `editMessage` casts `callTelegram`'s parsed body to `{ok?}`; `if (!body || body.ok === false) await sendMessage(...)`. `callTelegram` returns `await res.json()` so `ok` is always present on a real response; token-missing path no-ops both.
- **Sec N1 timingSafeEqual + length guard** — ADDRESSED. `secretMatches`: `a.length === b.length && timingSafeEqual(a, b)`; used in POST with `!secret || !provided || !secretMatches`.
- **Sec N3 non-1:1 chats rejected** — ADDRESSED. WhatsApp: `if (payload?.chat_id?.endsWith('@g.us')) return {ok:true}` (after `const payload`, before processing). Telegram: `chatId = callback_query?.message?.chat.id ?? message?.chat.id; if (chatId != null && chatId < 0) return {ok:true}` before the `callback_query`/`message` branch — group taps never reach `answerCallbackQuery`.
- **Sec N7 amount/description caps** — ADDRESSED. `set_amount`: `value > 0 && value <= 1_000_000_000_000` else `NONE`. `set_description`: `description[2].trim().slice(0, 500)`.

## WAVE C.1 — `662ef79`

- **NH W5 / Sab N7 / Sec N4 — delete dead parseIntent** — ADDRESSED. `parse-intent.ts` now imports only `BotIntent`; `parseIntent`, `schema`, `buildPrompt`, `FALLBACK`, `normaliseConfidence`, `GoogleGenAI`/`Type` import, `const MODEL` all removed. `matchReadCommand` + `READ_COMMANDS` intact. `ParsedIntent` gone from `types.ts`. Repo-wide grep: zero references to `parseIntent`/`ParsedIntent`; the `buildPrompt`/`normaliseConfidence` hits are unrelated local fns in `parse-batch.ts` / `receipt-extraction.ts`.
- **NH W6 — one money-column helper** — ADDRESSED. `render.ts moneyColumn` is the sole column helper (internal `idr()` strips NBSP). `replies.ts` `padAmount`/`amountColumnWidth` deleted; `batchReview` builds `totalRows`, calls `moneyColumn(totalRows)`, and appends the receipt verdict (`' ✅ cocok'` / `' ⚠️ selisih <idr>'`) onto the last row when `receiptTotal !== null`. Totals column and cross-check both still render (verified in `replies.ts` batchReview body).

## WAVE C.2 — `dd198c9`

- **NH W1 — roster honesty** — ADDRESSED. `DEFAULT_ROSTER` ids unchanged from `662ef79`; only `gemini-flash-latest` (vision) and `gemini-flash-lite-latest` (text) appended. Header + docblock both say "provisional"; the "Verified against … dashboard" claim is gone. New test `DEFAULT_ROSTER shape` asserts every id matches `/^gemini-[0-9.]+-flash(-lite)?$|^gemini-flash(-lite)?-latest$/`.
- **NH W2 — configureRouterIO comment** — ADDRESSED. The `let io` doc now reads "Re-pointed … by `core.ts` `handleIncoming` on every inbound message — the assignment is idempotent."
- **Sab N8 — 503 when all models parked** — ADDRESSED. `pickReturnedNull` set when `pickModel` returns null; after the loop `if (rosterFor(task).length > 0 && pickReturnedNull) throw Object.assign(new Error(...), { status: 503 })`, else `throw lastError`. Test confirms `isAiQuotaOrOverloadError(err) === true` and no model call.
- **Sec W4 — firestore.rules** — ADDRESSED. Client `write` now also excluded for `meta/{botLastBatch,botPrefs,botModelDay}` and `!(document[0] == 'bot_receipt_cache' || 'bot_parse_cache')`. `meta/scan_hints` still writable (not in list). `match /bot_meta/{doc}` and `match /bot_processed_messages/{doc}` → `allow read, write: if false`.
- **Sec W1 / Sab W9 — per-model merge-write** — ADDRESSED. `saveModelHealth(dayKey, modelId, state)`: `state===null` → `set({dayKey, models:{}, updatedAt})` whole-doc reset; else `set({dayKey, models:{[modelId]:state}, updatedAt}, {merge:true})`. `generateWithRouter` calls `io.save(today, spec.id, models[spec.id])` on every success and every failure, and `io.save(today, '', null)` once on day rollover; trailing bulk `io.save` removed. `RouterIO.save` type updated to match. `core.ts` is NOT in the C.2 diff — confirmed; line 43 passes `save: adminData.saveModelHealth` as a bare reference, so the new arity typechecks untouched.
- **Sec W1 part 2 — per-user AI cap** — ADDRESSED. `DAILY_USER_MODEL_CAP = 40`; `bumpUserModelCalls` = Pacific-day `{day,count}` doc, resets to 1 on a new day, `FieldValue.increment(1)` merge otherwise. `handleTextTransaction`: bump + `if (n > CAP) return replies.dailyAiLimit()` sits INSIDE `if (!parsed)` — i.e. after `getCachedParse` returned null — and before `parseTransactionBatch`. `handlePhoto`: bump in the `else` of `if (cached)`, before `extractFresh`/Drive upload. L0 path and cache hits never reach either bump (tests cover all three).
- **Sec N6 — link-code CSPRNG** — ADDRESSED. `randomLinkCode` uses `randomInt(0, alphabet.length)` (`node:crypto`). `createLinkCode` loops 5×, `.doc(code).create(...)`, `catch: if (err.code === 6) continue; else throw`, then throws after exhaustion.
- **Sec N5 — console.error message-only** — ADDRESSED (within stated scope). `error instanceof Error ? error.message : error` applied across telegram/route.ts, whatsapp/route.ts, flow-review.ts, flow-write.ts, parse-batch.ts, drive-upload.ts. Remaining raw `console.error(..., error)` are all outside the bot route/flow/router scope (`app/(main)/error.tsx`, `app/api/ai/scan-receipt`, `app/api/auth/google-drive/*`).

## Spot-check — `DraftLine.confidence` non-optional

CONFIRMED clean. Every `line()` / DraftLine fixture in `draft.test.ts`, `flow-review.test.ts`, `replies.test.ts` sets a real `confidence:` number; `parsed()`/`buildLinesFromReceipt` fixtures supply `confidence`/`mappingConfidence`. No `confidence: … as never`, `as any`, or `@ts-expect-error`. The `as never` occurrences in bot tests are all on Firestore `createdAt`/`updatedAt`/`linkedAt`/`expiresAt` Timestamp stubs — the codebase's pre-existing pattern, unrelated to `confidence`.

## NEW BREAKAGE

None material — no regression, half-applied change, or fix-induced bug found. Minor observations, none blocking:

1. **C.1 `idr()` now exists in both `render.ts` and `replies.ts`.** NH W6's named targets (`padAmount`, `amountColumnWidth`) are deleted and totals route through the single `moneyColumn`; the leftover is a trivial one-line NBSP-strip duplicated, and `replies.ts` `periodSummary`/`searchResults` still hand-roll their own inline column (pre-existing, never claimed by W6). Not a regression.
2. **B W5 `UNRESOLVED_DATE_RE` is broad** — matches bare `minggu` (week/Sunday), `tanggal \d`, weekday names anywhere in a segment. Jakarta place/context strings ("Pasar Minggu", "belanja minggu ini") now divert from L0 to the model path instead of auto-committing. Direction is safe (model path shows the date on the card); cost is an occasional unnecessary model call. Behaviour, not a bug.
3. **A `commit()` validates the passed-in `batch` but writes `claimed`** — a concurrent draft edit landing between `core.ts`'s `getPending` and `claimPendingForCommit` would have its new lines written without re-running the category-null / month-lock guards (TOCTOU). The single-owner, serial review flow makes this practically unreachable, and the old code had the same shape. Not newly introduced severity.
