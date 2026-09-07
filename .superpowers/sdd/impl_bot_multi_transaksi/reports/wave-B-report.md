# Adversarial wave B — robustness & validation

Branch `feat/bot-multi-transaksi`, on top of wave A (`ce50e4b`).

## Status: COMPLETE — one commit, all 10 items done, TDD'd.

Gates (all green):
- `npx vitest run` — 639 passed / 37 files (was 624; +15 new tests)
- `npx tsc --noEmit` — 0 errors
- `npx next lint --dir src` — no warnings or errors
- `npx vitest run src/app/api/bot` — 39 passed / 3 files

No files outside the wave-B list were touched. Wave-C files untouched.

## Per-item

| ID | Item | Status | Fix |
|----|------|--------|-----|
| Sab W1 | `getUserTimezone` unvalidated tz → RangeError on hot path | done | `admin-data.ts` — probe `new Intl.DateTimeFormat('en-US', { timeZone })` in try/catch, fall back to `Asia/Jakarta`. Test: `'Asia/Jkarta'` / `'WIB'` / garbage → `'Asia/Jakarta'`. |
| Sab W2 | `getPending` derefs `expiresAt.toMillis()` before validating | done | `admin-data.ts` — `const ms = raw.expiresAt?.toMillis?.(); if (ms == null || ms < Date.now()) { clearPending; return null }` (mirrors `claimPendingForCommit`). Test: `expiresAt = { _seconds: 1 }` → null + `clearPending`, no throw. |
| Sab W5 | L0 auto-commit ignores backdate phrases except "kemarin" | done | `local-resolver.ts` — new `hasUnresolvedDateHint(segment)` (date-ish regex AND `detectDateOffset === 0`); `tryLocalBatch` returns `null` if any segment has one → model path L1. Test: `"beras 3 hari lalu 50rb"` + strong hint → `null`. |
| Sab W6 | `resolveLocally` category match via unbounded `String.includes` | done | `local-resolver.ts` — name + head match now use a `\b`-anchored `RegExp` from the escaped name/head (`matchesWholeWord`), length floors kept. Tests: `"beli makanan kucing 80rb"` → no match (was matching head "makan" inside "makanan"); `"makan siang 35rb"` → still matches. |
| Sab W7 | `receiptDate` validates string shape not values | done | `draft.ts` — after `setUTCFullYear`, post-check `getUTCFullYear/Month/Date` like `withClockOf`, else `return now`. Test: `'2026-02-30'` / `'2026-13-01'` → `now`. |
| Sab W8 | `/riwayat 0` breaks (empty result or Firestore `.limit(0)` reject) | done | `core.ts` — `Math.min(20, Math.max(1, Number(cmd.args[0])))`. Test: `/riwayat 0` → `getRecentTransactions('user-1', 1)`, non-empty when data exists. |
| Sab W10 | Telegram `editMessage` has no fallback send on failure | done | `telegram/route.ts` — `callTelegram` already returns parsed body; `editMessage` now `await sendMessage(chatId, reply)` when `!body || body.ok === false`. Test: `editMessageText` → `{ ok: false }` → `sendMessage` follows. |
| Sec N1 | Telegram webhook secret compared with `!==` | done | `telegram/route.ts` — `secretMatches()` = length guard + `crypto.timingSafeEqual` (mirrors GOWA route). Existing 403/200 tests stay green; added a same-length wrong-secret 403 test. |
| Sec N3 | Identity keyed on conversation → group-chat cross-drive | done | `whatsapp/route.ts` — `payload.chat_id` ends with `@g.us` → 200, no `processMessage`. `telegram/route.ts` — `message`/`callback_query.message` `chat.id < 0` → 200, skip. One-line comment each. Tests: `@g.us` GOWA payload → `handleIncoming` not called; Telegram `chat.id: -100123` (message + tap) → not processed. Rewrote the old "strips @g.us suffix" test to assert non-processing. |
| Sec N7 | `set_amount` / `set_description` unbounded | done | `review-commands.ts` — `set_amount` rejects `value > 1_000_000_000_000` (→ `{ kind: 'none' }`); `set_description` truncates `.slice(0, 500)` (not rejected). Tests: `nom 1 999999999999999` → not valid; `ket 1 <600 chars>` → `text.length === 500`. |

## Files changed (10)

Source: `src/shared/bot/admin-data.ts`, `local-resolver.ts`, `draft.ts`, `core.ts`, `review-commands.ts`; `src/app/api/bot/telegram/route.ts`, `whatsapp/route.ts`.
Tests: `admin-data.test.ts`, `local-resolver.test.ts`, `draft.test.ts`, `core.test.ts`, `review-commands.test.ts`; `src/app/api/bot/telegram-callback.test.ts`, `webhook-auth.test.ts`, `whatsapp-message.test.ts`.

## Notes / design calls

- **W6 test fixture**: the existing `local-resolver.test.ts` `CATEGORIES` already has `Makan & Minum` (head "makan"). The exploit the reports describe as "head 'makanan' substring" is really the head "makan" matching *inside* "makanan" ("makanan kucing" = cat food). Word-boundary `\b` fixes exactly that and keeps "makan siang" matching. No new `Makanan & Minuman` fixture added — with a genuine "makanan" head, "makanan" in "makanan kucing" is a legitimate whole-word hit and could not (and should not) be rejected.
- **W5** guard placed at the top of the `tryLocalBatch` segment loop; `detectDateOffset`-resolved phrases ("kemarin", "kemarin lusa") are explicitly excluded so the existing per-segment date test still passes.
- **N3 / W10** are covered only through the route POST handlers (no unit seam for `stripJidSuffix` / `editMessage`), consistent with the existing route test style.
