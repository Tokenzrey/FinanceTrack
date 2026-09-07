# Task 11 Report — Perintah Baca Baru + Dokumentasi

**Status:** Done (Finance-FE parts only — GOWA `.env` / docker / sibling `context.md` skipped per scope ruling)
**Commit:** `8d23b0e` on `feat/bot-multi-transaksi` (parent `fd4e86d`)

## What was built

| File | Change |
|---|---|
| `types.ts` | `BotIntent` union += `today_summary \| week_summary \| search \| undo \| stats`. |
| `parse-intent.ts` | 5 `READ_COMMANDS` patterns before `help`: `/hariini\|hari ini\|today`, `/minggu\|mingguan\|pekan\|week`, `/statistik\|stats`, `/undo\|urungkan`, bare `/cari\|search`. |
| `admin-data.ts` | New `getTransactionsBetween(userId, from, to)` (half-open `date` range, `orderBy desc`) and `searchTransactions(userId, keyword, limit=10, scanLimit=500)` (recent-window fetch + in-memory `description.includes`, capped). |
| `replies.ts` | New `periodSummary`, `searchNeedsKeyword`, `searchEmpty`, `searchResults`, `undone`, `nothingToUndo`, `stats`. `/help` rewritten — grouped, emoji headers, all 5 new commands. |
| `core.ts` | `dispatchText`: `/cari <arg>` regex handled before `matchReadCommand`. `handleReadCommand`: branches for the 5 new intents. New handlers `handleUndo`, `handleSearch`, `handlePeriodSummary` (+ `tzOffsetMs`), `handleStats` — brief's code verbatim. Import adds `dayKeyInTz, formatDayLong`. |
| `parse-intent.test.ts` / `core.test.ts` | Brief's cases. `core.test.ts` `./admin-data` mock: `getUserTimezone` promoted to `vi.fn()` + `getTransactionsBetween`/`searchTransactions`/`getLastBatch`/`deleteTransactions`/`clearLastBatch` stubs; `beforeEach` default tz. |
| `BOT_SETUP_CHECKLIST.md` | `setMyCommands` curl + counts 14→19; new "Command baca & aksi baru" checklist rows for `/hariini` `/minggu` `/statistik` `/cari` `/undo`; `WHATSAPP_AUTO_REPLY=""` line in §5 + a WA verification row. |

## Deviation

New `replies.ts` amount rendering uses the module's existing `idr()` helper (strips the
Intl NBSP) instead of the brief's literal `formatIDR()` — the brief's own `/hariini`
test asserts `'Rp 35.000'` with a plain space, and every other chat reply already uses
`idr()`. Behaviour-identical otherwise.

`/undo` etc. mid-review reach `handleReadCommand` like any other read command (brief
only specified the `dispatchText` path); harmless.

## Gates

- `npx vitest run src/shared/bot` → 257 passed (14 files)
- `npx vitest run` → **521 passed / 33 files** (was 512; +3 parse-intent, +6 core, 0 regressions)
- `npx tsc --noEmit` → clean
- `npx next lint --dir src` → clean

## Concerns

- No admin-data tests for `getTransactionsBetween`/`searchTransactions` (not in the
  brief's file list; siblings `getMonthTransactions`/`getRecentTransactions` are also
  untested — thin query wrappers).
- `stats` and `periodSummary`'s empty branch have no direct assertion (brief gave no
  test for `/statistik` or `/minggu`); both are exercised structurally via `/hariini`.
- Brief Step 9 (GOWA auto-reply env + `docker compose up -d`) and sibling-repo
  `context.md` were skipped per the scope ruling — controller handles them.
