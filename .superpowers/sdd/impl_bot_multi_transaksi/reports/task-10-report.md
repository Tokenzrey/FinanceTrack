# Task 10 report — UX Hidup: mengetik, reaksi, menu command

Branch `feat/bot-multi-transaksi`. Prior HEAD `76aab78` (507 green). New HEAD `fd4e86d`.

## What was built

### `src/app/api/bot/whatsapp/route.ts`
- New helpers above `sendMessage`: `gowaAuth()` (factors the base-URL-normalise +
  Basic-auth header out of the old inline block), `gowaPost(path, body)` (best-effort
  POST, swallows its own error + logs), `setTyping(chatId, action)` →
  `POST /send/chat-presence {phone, action}`, `react(messageId, chatId, emoji)` →
  `POST /message/{id}/reaction {phone, emoji}` (id `encodeURIComponent`d).
- `sendMessage` refactored to reuse `gowaAuth()` — one auth path, no behaviour change
  (`GOWA_BASE_URL` has no trailing slash in practice; `replace(/\/+$/, '')` is a no-op).
- `processMessage` wrapped per brief: `react 👀` + `setTyping 'start'` before work;
  `react ✅` after a successful `sendMessage`; `setTyping 'stop'` in a `finally`.

### `src/app/api/bot/telegram/route.ts`
- `TelegramUpdate['message']` gained `message_id?: number`.
- New helpers after `answerCallbackQuery`: `sendChatAction(chatId)` →
  `sendChatAction {action:'typing'}`, `reactTo(chatId, messageId, emoji)` →
  `setMessageReaction {reaction:[{type:'emoji',emoji}]}`. Both go through the existing
  `callTelegram`, which already swallows its own error — no extra try/catch.
- `handleTextOrPhotoMessage`: `sendChatAction` + `reactTo 👀` at the top (before the
  `try`; `callTelegram` cannot throw), `reactTo ✅` after a successful `sendMessage`.
  Both reactions guarded by `if (message.message_id)`.

### `scripts/register-telegram-commands.mjs` (new)
Created verbatim from the brief. NOT run (no bot token here). One-shot: `setMyCommands`
(18 commands), `setChatMenuButton`, `setMyDescription`, `setMyShortDescription`.

## Tests

### `src/app/api/bot/whatsapp-message.test.ts`
- New `describe('WhatsApp (GOWA) — live acknowledgements')` — brief's 3 cases verbatim
  (reaction+presence+reply present; presence actions `['start','stop']`; a rejected
  reaction/presence never stops `handleIncoming`).
- Two **existing** assertions adjusted: they read `mock.calls[0]` as the `/send/message`
  call, but the 👀 reaction now fires first. Changed to
  `mock.calls.find(c => c[0].endsWith('/send/message'))`. Backward-compatible (verified
  green before the route change too).

### `src/app/api/bot/telegram-callback.test.ts`
- New `describe('Telegram webhook — live acknowledgements')` — brief's 2 cases verbatim
  (order: `sendChatAction` before `sendMessage`; a rejected `setMessageReaction` still
  replies). No existing test touched.

## Gates
- `npx vitest run src/app/api/bot` → **26 passed** (3 files)
- `npx vitest run` → **512 passed**, 33 files, 0 failing (was 507; +3 WA, +2 TG)
- `npx tsc --noEmit` → exit 0
- `npx next lint --dir src` → "No ESLint warnings or errors", exit 0

## Concerns
- `sendMessage` refactor to `gowaAuth()` is slightly beyond "minimal diff", but the
  task note explicitly allowed it and it removes the duplicated auth block. Net −3 lines
  there; one auth code path.
- Script unrun by design — verify in Telegram after first deploy (☰ button + `/`
  autocomplete list).
