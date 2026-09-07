# Adversarial review — THE SABOTEUR

Range `b07bde8..57ee303`, branch `feat/bot-multi-transaksi`. Suite 604 green / tsc 0 / lint clean — these are the holes the tests do not exercise (all single-threaded, all clean 1:1 model parses, no malformed Firestore docs, no invalid tz).

Counts: CRITICAL 2 · WARNING 10 · NOTE 15

---

## CRITICAL

### C1 — `commit()` is not idempotent; a double confirm writes the batch twice
`src/shared/bot/flow-review.ts:82-100` (`createTransactionsBatch` → `rememberLastBatch` → hint learning → `clearPending`), reached from `src/shared/bot/core.ts:94` and both routes' `waitUntil`.

De-dup exists only on the raw inbound id (`claimInboundMessage` / `claimUpdate`), never on the commit itself.

* **Trigger A — double tap / double type.** User taps the Telegram "✅ Simpan" button twice (Gemini/Firestore latency makes the card look unresponsive; the keyboard is only removed by `editMessage` *after* `handleIncoming` returns). Two `callback_query` updates → two distinct `update_id` → `claimUpdate('cb', …)` claims both → two `handleCallbackQuery` run concurrently in `waitUntil` → both read the still-present pending draft → both `commit()` → **batch written twice**. Same on WhatsApp by typing `ok` twice (two GOWA message ids).
* **Trigger B — retry after a post-write failure.** `createTransactionsBatch` succeeds, then `rememberLastBatch` (or `clearPending`) throws on a transient Firestore blip. `commit` has no try/catch around those, so it rejects → webhook catch → "Ada masalah, coba lagi". The pending draft was never cleared. User resends `ok` → `getPending` still returns the draft → `commit()` again → **duplicate transactions from a transient bookkeeping error**.

Exact input → wrong output: send `kopi 20rb, bensin 50rb` → review card → tap Simpan twice → 4 transactions recorded, ledger silently doubled, `/undo` only reverses the last `rememberLastBatch` set.

**Fix:** write the transactions and delete `botPending` in one Firestore `runTransaction`, keyed on the draft, so a second commit finds nothing pending and no-ops.

### C2 — `set_mode:'single'` / `gabung` sums across `type`; income + expense collapse into one wrong-signed transaction
`src/shared/bot/draft.ts:133-151` (`collapseToSingle`), no guard at `src/shared/bot/flow-review.ts:127-128` (`case 'set_mode'`), command accepted unconditionally at `src/shared/bot/review-commands.ts:115` and advertised in `replies.reviewHelp` with no scope note.

`collapseToSingle` does `batch.lines.reduce((t,l) => t + l.amount, 0)` over **all** lines regardless of `type`, then returns `{...heaviest, amount:<sum>}` — taking the heaviest line's `type`, `categoryId`, `pillar`.

Exact input → wrong output: text message `gaji 5jt, beli hp 3jt` → review card shows 🔺5jt income + 🔻3jt expense → user types `gabung` then `ok`. Recorded: **one 8,000,000 income transaction in the salary category**. The 3M expense is gone; income overstated by 3M. The review card's own totals block still says income 5M / expense 3M (it uses `batchTotals(batch)`), and `batchSaved` shows `🔺 8.000.000 · Gaji` — every surface disagrees, so the user cannot catch it from the text. The Telegram mode button is correctly gated to `source==='receipt'` (all-expense), but the typed command is not.

**Fix:** reject `set_mode:'single'` (or make `collapseToSingle` refuse) when `new Set(batch.lines.map(l => l.type)).size > 1`; ideally also gate `gabung` to `source==='receipt'` to match the button.

---

## WARNING

### W1 — `getUserTimezone` returns the stored string unvalidated; a bad IANA name throws on the hot path
`src/shared/bot/admin-data.ts:584-588`. Returns `snap.data().timezone.trim()` as-is. A profile value like `"Asia/Jkarta"`, `"WIB"`, or a stale/garbage string makes `new Intl.DateTimeFormat('id-ID',{timeZone})` throw `RangeError` in `formatDateTime` (used by `transactionRecorded`, `batchReview`, `batchSaved`, `searchResults`, `categoryDetail`, …) and in `dayKeyInTz` (`handlePeriodSummary`). Every transaction confirmation and review card then rejects → generic error → **user cannot record anything via the bot** until the profile is fixed on the web.
**Fix:** probe once in a try/catch (or check `Intl.supportedValuesOf('timeZone')`), fall back to `Asia/Jakarta`.

### W2 — `getPending` dereferences `expiresAt.toMillis()` before validating it
`src/shared/bot/admin-data.ts:224`. If the `botPending` doc's `expiresAt` is not a live `Timestamp` instance (plain `{_seconds,_nanoseconds}` from a REST write / export-import / console edit), `.toMillis` is `undefined` → TypeError out of `getPending` → every inbound message for that user throws → generic error, indefinitely. The unknown-`pendingKind` cleanup two lines down (which would `clearPending`) never runs.
**Fix:** `const ms = raw.expiresAt?.toMillis?.(); if (ms == null || ms < Date.now()) { await clearPending(userId); return null }`.

### W3 — single-mode confirmation names a different category than was written
`src/shared/bot/flow-review.ts:103`. `savedLines` for `mode==='single'` is `[{...batch.lines[0], amount: dtos[0].amount, description: dtos[0].description}]`, but `batchToDTOs` built the DTO from `collapseToSingle` = the **heaviest** line. When the heaviest line is not `lines[0]` (normal for a receipt in scan order), `batchSaved` shows `lines[0]`'s type / category / date against the collapsed total. Input: receipt `[kopi 20rb @Kafe, laptop 15jt @Elektronik]` → `gabung` → `ok` → written as Elektronik 15,020,000, card says `Kafe 15.020.000`.
**Fix:** build `savedLines` from `collapseToSingle(batch)`, the same source `batchToDTOs` uses.

### W4 — fast-path auto-accept reads confidence from the wrong parsed line
`src/shared/bot/flow-write.ts:113-120` with `src/shared/bot/draft.ts:50-54`. `buildLinesFromParsed` does `continue` on any line whose `amountText` won't parse, so `lines[k]` can correspond to `parsed[k+dropped]`. The gate then uses `topConfidence = parsed[0]?.confidence`. Input: `bayar 5 orang, makan 50rb` → model returns `[{amountText:"5 orang", confidence:95}, {amountText:"50rb", confidence:35, categoryId:X}]` → line 0 dropped (`parseAmount("5 orang")===null`) → `lines=[50rb line]`, `length===1`, `isFastPath` true, `topConfidence=95` → `commitDirect` auto-records the 35%-confidence line with **no review**.
**Fix:** carry confidence on the built `DraftLine` (or filter `parsed` before reading `[0]`).

### W5 — L0 auto-commit ignores every backdate phrase except "kemarin"/"kemarin lusa"
`src/shared/bot/local-resolver.ts:37-42` (`detectDateOffset`), used at `:146-147`, auto-committed at `src/shared/bot/flow-write.ts:87-93`. "3 hari lalu", "senin lalu", "minggu lalu", "tanggal 5", "tadi subuh" all → offset 0. Input: `beras 3 hari lalu 50rb` where `beras` is an established hint (freq≥4) → single confident line → `commitDirect` → **recorded dated today**, no review, and `transactionRecorded` is the first time any date is shown. The model path (`buildLinesFromParsed`, ±365) understands more than L0 does, yet L0 is the one that skips confirmation.
**Fix:** if `detectDateOffset` sees date-ish tokens it can't resolve, force `startReview` instead of `commitDirect`.

### W6 — `resolveLocally` matches category names with unbounded `String.includes`
`src/shared/bot/local-resolver.ts:90-101`. Name match (`len>=4`, conf 92) and head match (`len>=5`, conf 86) both use `lower.includes(name)` — no word boundary. Both clear the 80 auto-accept. Input: category "Makanan & Minuman" → `beli makanan kucing 80rb` (cat food) → head "makanan" is a substring → conf 86 → `commitDirect` files it as groceries. Same for "kopi" in "kopi tumbler", "roti" in "grosir rotinya", etc.
**Fix:** require a whole-token / word-boundary match, not `includes`.

### W7 — `receiptDate` validates the string shape but not the values; invalid dates roll over silently
`src/shared/bot/draft.ts:78-84`. Regex accepts `2026-13-01` / `2026-02-30`; `dated.setUTCFullYear(2026, 12, 1)` → Jan 2027, `setUTCFullYear(2026, 1, 30)` → Mar 2 — `Number.isNaN` is false so it is returned as the transaction date instead of falling back to `now`. `review-commands.ts:withClockOf` range-checks (`getUTCDate()!==day`); this one doesn't.
**Fix:** reuse the `withClockOf` post-check (`dated.getUTCDate()===d && dated.getUTCMonth()===m-1`), else `return now`.

### W8 — `/riwayat 0` (and `/riwayat 0 <kata>`) returns "no transactions" regardless of data, or throws
`src/shared/bot/core.ts:293-296`. `Math.min(20, Number('0'))` = 0. Keyword branch → `searchTransactions(userId, kw, 0)` → `.slice(0,0)` → `[]` → `recentTransactions([])` → "Belum ada transaksi tercatat." even when matches exist. No-keyword branch → `getRecentTransactions(userId, 0)` → Firestore `.limit(0)` (invalid → rejects on the Admin SDK) → handler error → generic reply. Unvalidated user count reaches the query builder.
**Fix:** `const limit = hasCount ? Math.min(20, Math.max(1, Number(cmd.args[0]))) : 5`.

### W9 — `bot_meta/geminiHealth` is read-modify-write with a whole-document `.set()`
`src/shared/bot/admin-data.ts:638-643` + `src/shared/lib/gemini-router.ts:211-213,222`. `generateWithRouter` saves the entire `models` map after every model call. Two pipelines in flight (routine — receipt extraction alone does vision then text): pipeline B, having `io.load()`ed before A's save, overwrites A's vision-tier increment with B's stale copy. The ponytail comment assumes "worst case one extra 429"; last-writer-wins across the full map means multiple lost increments per burst, and around the Pacific-midnight `dayKey` flip both sides reset-and-clobber. Still self-heals via a real 429 → `noteFailure('quota')`, but low-RPD models (20/day, `RPD_RESERVE` 1) can show users `aiUnavailable` while quota actually remained.
**Fix:** `FieldValue.increment` per-model counter, or a `runTransaction` around load/mutate/save, or merge-write only the touched model keys.

### W10 — Telegram `editMessage` has no fallback to a fresh send on API failure
`src/app/api/bot/telegram/route.ts:82-90` vs the WhatsApp equivalent at `whatsapp/route.ts:125` which does `if (!res.ok) await sendMessage(...)`. If editing the "📸 Struk diterima…" placeholder fails ("message to edit not found" after the user deletes it, "message can't be edited", a Telegram blip), the real review card / result is **never delivered** — the user is left on the placeholder. For a tapped `rv:save` the commit already ran, so the user re-taps → feeds C1.
**Fix:** mirror the WhatsApp path — on `body.ok === false`, `sendMessage(chatId, reply)`.

---

## NOTE

* **N1** `src/shared/bot/draft.ts:133` — `collapseToSingle` has no empty-`lines` guard (`heaviest` = `undefined`, spreads to a `DraftLine` missing `type`/`categoryId`/`dateIso`/`options`). Safe only because all three call sites pre-check `lines.length > 0`; any new caller that doesn't will emit a malformed line.
* **N2** `src/shared/bot/admin-data.ts:547-556` — `deleteTransactions` returns `Math.min(ids.length, MAX_BATCH_WRITES)`, the count *attempted*, not deleted (`batch.delete` on a missing doc is a silent no-op). `/undo` reports "N transaksi dibatalkan" even when the web app already removed some/all.
* **N3** `src/shared/bot/admin-data.ts:347-354` + `core.ts:459-468` — `getTransactionsByIds` with >10 ids returns only surviving docs; `handleUndo` builds its closed-month set from survivors only, so a batch whose closed-month rows were already deleted on the web skips the month-lock block on the rest.
* **N4** `src/shared/bot/core.ts:62-71,75-97` — stale `rv:*` tokens tapped after the 15-min pending TTL fall through to `handleTextTransaction`. `rv:del:20` → `parseAmount` sees "20" → not null → spends a `parseTransactionBatch` model call and can open a bogus 20-rupiah review draft.
* **N5** `src/shared/bot/core.ts:299-304` — bare `/export` / `/ekspor` has `args.length === 0`, so `handleCommandWithArgs` is skipped, and there is no `export` entry in `READ_COMMANDS` → falls to `handleTextTransaction('/export')` → `amountNotFound`. Every other args command has a bare read-command fallback; this one doesn't.
* **N6** `src/shared/bot/flow-review.ts:127-128` — `gabung` on an all-expense *text* batch (not just the C2 mixed case) silently merges every line into the heaviest line's category, discarding the itemisation the user was told to review.
* **N7** `src/shared/bot/parse-intent.ts:104-133` — `parseIntent` is now dead (only `matchReadCommand` is imported) but still holds a direct `new GoogleGenAI().models.generateContent` with its own `GEMINI_MODEL`, bypassing the quota ledger. A future re-import silently reintroduces an unmetered Gemini path.
* **N8** `src/shared/lib/gemini-router.ts:202,207,223` — when every model is inside its 60s overload cooldown (none quota-exhausted), `pickModel` returns `null` on attempt 0, so `lastError` stays the generic `"Tidak ada model tersedia"` Error; `isAiQuotaOrOverloadError` is false → user sees `genericError` instead of `aiUnavailable`.
* **N9** `src/shared/lib/scan-hints.ts:61-92` via `flow-review.ts:89-95` — a single commit of `kopi 20rb, kopi susu 15rb` applies two `{keyword:'kopi'}` corrections → `frequency += 2` in one shot, against the "one accidental tap should not become a standing rule" intent (4 confirmations = auto-accept).
* **N10** `src/shared/bot/core.ts:80-88` — a read command mid-review (`/undo`, `/hariini`, …) is handled and the draft preserved, but `/undo` there deletes the *previously committed* batch, not the pending draft. A user who means `batal` and types `/undo` silently reverses an unrelated earlier commit.
* **N11** `src/shared/bot/flow-review.ts:147-156` — `set_category` reads the *persisted* `line.options`; a category deleted between renders is still offered, and picking it writes a dangling `categoryId` (`batchToDTOs` → `pillarOf` miss → `inferPillar` → `'needs'`). `commit`'s blocking check only rejects `categoryId === null`.
* **N12** `src/shared/bot/core.ts:498-515` — `tzOffsetMs` takes the zone's offset at `now` and applies it to local midnight; correct only for DST-free zones. A DST zone set in the profile shifts the `/hariini` and `/minggu` window by an hour for the days around each transition.
* **N13** `src/shared/bot/flow-write.ts:186-194` + `admin-data.ts:665-671` — a receipt cached before upload-caching shipped (`cached.receipt` absent) triggers `uploadFresh()` on every re-send even though the original send did upload, creating duplicate Drive files until the 30-day TTL clears the entry.
* **N14** `src/shared/bot/cache.ts:21-25` + `flow-write.ts:102-112` — `hashParse` keys on category *ids* only. Flipping a still-existing category's `pillar` (e.g. needs→income) is a cache hit; the cached `ParsedLine.type` no longer matches, `buildLinesFromParsed` drops the category (`chosen = null`) → line silently needs re-categorising. Degrades to asking, not to wrong data, but the "shrank category set" case is only covered because deletion changes the id list.
* **N15** `src/shared/bot/flow-write.ts:61-71` + `flow-review.ts:71-80` + `core.ts:461-464` — commit / undo month attribution uses `date.getFullYear()/getMonth()` on the UTC instant with no tz offset, while `/hariini` and `/minggu` are tz-aware. A transaction created in the first or last local hour of a month is month-locked against and bucketed into the adjacent (UTC) month, so `/ringkasan` and the web app can disagree with `/hariini` about which month it belongs to.
