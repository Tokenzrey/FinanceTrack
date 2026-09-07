# Task 17 Report — Rich, argument-taking, preference-aware commands

## Status
Complete. Whole suite green: **590 passed / 37 files** (was 561). `npx tsc --noEmit` exit 0. `npx next lint --dir src` clean.

## New files
- `src/shared/bot/render.ts` + `render.test.ts` — `bar`, `trendArrow`, `statusEmoji`, `moneyColumn` exactly per brief.
- `src/shared/bot/command-args.ts` + `command-args.test.ts` — `parseCommandArgs`.

### Brief deviation: `command-args.ts` regex
The brief's `COMMAND_RE = /^\/?([a-z][a-z_]*)\b\s*([\s\S]*)$/i` fails the brief's own tests: it matches `"makan siang 35rb"` as command `makan` (test expects `null`). Implemented the actual rule the tests encode instead: **with a leading slash** the first word is the command and the rest is free-form; **without a slash** only a single all-letters word counts. All 5 brief test cases pass. Brief test body also needed `?.` (repo is `strict`) — `.command`/`.raw` on a nullable return.

## Signature changes
| Symbol | Before | After |
|---|---|---|
| `replies.summary` | `(summary)` | `(summary, insights: Insight[], health: {total}, prefs: BotPrefs)` |
| `replies.balance` | `(summary)` | `(summary, pillarFilter: Pillar\|null, prefs: BotPrefs)` |
| `replies.stats` | `(monthLabel, dailyAverage, projectedMonthEnd, topCategories)` | **removed** |
| `replies.statsRich` | — | `(monthLabel, summary, merchants, methods, consistency, regret)` (new) |
| `replies.categoryDetail` | — | `(c: CategorySummary, recent[], tz)` (new) |
| `replies.categoryNotFound` | — | `(name, categories[])` (new) |
| `replies.exportReady` / `exportEmpty` | — | new |
| `BotReply` | — | `+ document?: { filename; mimeType; base64 }` |
| `core.handleReadCommand` | inline `get_recent` / summary tail | delegates to `handleRecent` / `handleSummary` / `handleBalance` |
| `core` (new private fns) | — | `handleCommandWithArgs`, `monthFromArgs`, `handleSummary`, `handleBalance`, `handleRecent`, `handleCategoryDetail`, `handleExport`, `quickHealth`; consts `MONTH_NAMES`, `PILLAR_WORDS` |

`replies.summary`/`balance` call site (`core.ts`): `handleSummary`/`handleBalance` build `insights` via `buildInsights`, health via `quickHealth` (see below), `prefs` via `adminData.getBotPrefs`.

## Reconciliation decisions
- **stats vs statsRich**: removed `replies.stats` entirely, added `replies.statsRich`, rewired `handleStats` to build the rich args (`topMerchants`, `paymentMethodBreakdown`, `loggingConsistency`, `regretTotal`). No test asserted `stats` output; `parse-intent` `stats` intent unchanged. One stats reply, not two.
- **`/cari`**: removed the `/^\/?(?:cari|search)\s+(.+)$/i` special-case from `dispatchText`; `/cari <kata>` now flows through `handleCommandWithArgs` → `handleSearch` (single path). Bare `/cari` still → `matchReadCommand` → `search` intent → `searchNeedsKeyword`. All three Task-11 `/cari` tests pass unchanged; added one asserting the new route.
- **`get_recent`**: bare `/riwayat` and `/riwayat 10 kopi` both go through the new `handleRecent(userId, limit, keyword)`; a keyword uses `searchTransactions`, otherwise `getRecentTransactions`.
- **health score**: added `quickHealth(summary, transactions)` calling the real `financialHealthScore` with the inputs the bot has cheaply in hand (savings rate, budget adherence, logging consistency, mood-positive rate). `emergencyFundProgress`/`debtToIncomeRatio` passed as `0` — they need assets+liabilities reads not on this path; marked with a `ponytail:` comment. Returns `{ total, breakdown }`, structurally satisfies the brief's `health: { total: number }`.
- **`getCategoryItems` — skipped.** The brief flagged it as conditional ("if `categoryDetail` needs item names"). The brief's own `categoryDetail`/`handleCategoryDetail` render `t.description`, not item names, and `handleExport` calls `transactionsToCsv(sorted, categories)` with no item-name map. Nothing needs it, so it was not added (YAGNI).
- **`/target <nama>` (`handleGoalDetail`) — omitted from `handleCommandWithArgs`.** It's outside the task's stated scope (`/ringkasan`, `/saldo`, `/kategori`, `/riwayat`, `/export`), and unlike every other branch the brief specifies no `handleGoalDetail` body and no `replies.goalDetail` copy — implementing it would be a guess. `/target <anything>` falls through to the existing bare `/target` handler (lists all goals); no regression, no test affected.

## Routes
`BotReply.document` sent **after** the text reply in both adapters:
- Telegram `handleTextOrPhotoMessage`: new `sendDocument(chatId, doc)` → multipart `POST .../sendDocument` (`chat_id` + `document`).
- WhatsApp `processMessage`: new `sendDocument(chatId, doc)` → multipart `POST {base}/send/file` (`phone` + `file`), no `Content-Type` header. Both best-effort (swallow their own errors), `FormData`/`Blob`/`Buffer` from the Node runtime. Not wired into the Telegram callback path (export is never a button).

## Tests added
- `render.test.ts` (5), `command-args.test.ts` (5) — brief's exact cases.
- `replies.test.ts` — `mockSummary` fixed (`categories: []`, `income` pillar, `dailyAvgSpend`); new `mockCategorySummary`; balanced-tag cases for `summary`/`summary(ringkas)`/`balance`/`balance(pillar)`/`categoryDetail`/`categoryNotFound`/`statsRich`/`exportReady`/`exportEmpty`.
- `core.test.ts` — new `argument-taking commands` describe: `/ringkasan agustus`, `/saldo kebutuhan`, `/riwayat 10 kopi`, `/kategori makan`, `/kategori zzz`, `/export 8` (+ empty), `/cari kopi`.
- `telegram-callback.test.ts` / `whatsapp-message.test.ts` — `/export` sends `sendDocument` / `/send/file` after the text; negative case for a doc-less reply.

## `/help`
Ringkasan block lines rewritten to the argument forms; new `⚙️ Kustomisasi` block (`/mode ringkas`, `/mode detail`, `/atur`).
