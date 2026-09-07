# Task 13 Report — Preferensi Bot per User

**Status:** Done
**Commit:** `72d2bc1` on `feat/bot-multi-transaksi` (parent `723cf40`)

## What was built

Per-user bot preferences reachable via `/mode` and `/atur`, following the brief's
exact code.

| File | Change |
|---|---|
| `src/shared/bot/types.ts` | Added `BotPrefs` interface + `DEFAULT_BOT_PREFS` const (§12 shape, verbatim). Nothing removed. |
| `src/shared/bot/prefs-commands.ts` | **New.** `parsePrefsCommand(raw): PrefsCommand` — deterministic parser for `/mode <verbosity>` and `/atur <field> <value>`. Bare command → `{kind:'show'}`; unknown field or unparseable value → `{kind:'invalid', field}`; non-settings text → `{kind:'none'}`. Clamps `autoAcceptConfidence` to 0–100. |
| `src/shared/bot/prefs-commands.test.ts` | **New.** 7 cases from the brief. |
| `src/shared/bot/admin-data.ts` | Added `getBotPrefs(userId)` (merges stored doc over `DEFAULT_BOT_PREFS`, mirroring `FirestoreUserRepository.findSettings`) and `saveBotPrefs(userId, patch)` (writes `stripUndefined(patch)` merge to `users/{uid}/meta/botPrefs`, returns re-read). |
| `src/shared/bot/replies.ts` | Added `prefsCard`, `prefsUpdated`, `prefsInvalid` (Bahasa, HTML, `escapeHtml` on the field name). |
| `src/shared/bot/core.ts` | `dispatchText` now runs `parsePrefsCommand(trimmed)` before `matchReadCommand` — the fresh-text path (nothing pending). Non-`none` → invalid/show/save reply. |
| `src/shared/bot/core.test.ts` | Added `getBotPrefs` stub to the `./admin-data` mock so the module stays complete. |

## Placement note

Brief Step 6 says "in `handleIncoming` … BEFORE `matchReadCommand`". There are two
`matchReadCommand` call sites; the prefs check went into `dispatchText` (the
non-pending fresh-text path), which is the one Step 6's snippet sits above. A user
mid-review still can't reach prefs commands — matches the brief's snippet exactly.

## Gates

- `npx vitest run src/shared/bot/prefs-commands.test.ts` → 7 passed
- `npx vitest run` → **501 passed / 33 files** (was 494; +7 new, 0 regressions)
- `npx tsc --noEmit` → clean
- `npx next lint --dir src` → clean

## Concerns

None. `getBotPrefs`/`saveBotPrefs` are unused by any write flow yet — Task 14 reads
`getBotPrefs` per the plan. `quickCategories` is carried in the type/default but not
settable via `/atur` (no field in the brief's parser); that's intentional per spec.
