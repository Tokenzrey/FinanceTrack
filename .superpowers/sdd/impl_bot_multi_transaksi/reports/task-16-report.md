# Task 16 — Latency: parallel receipt work + placeholder edited in place

**Status:** done. Commit `ff5ace7` on `feat/bot-multi-transaksi`.

## What changed

### `src/shared/bot/flow-write.ts`
- Factored the cache-lookup + `extractReceipt` + cache-store block out of `handlePhoto`
  into `readReceipt(userId, msg, spendCategories, hints): Promise<ReadOutcome>`, a
  discriminated result (`{ ok: true; result } | { ok: false; reply }`) so a model
  failure returns a reply instead of throwing.
- `handlePhoto` now runs `Promise.all([readReceipt(...), uploadReceiptForUser(...)])`.
  The upload never needed the extraction, only the bytes — it was costing 2-5s in
  series on every receipt. `if (!outcome.ok) return outcome.reply`.
- Deliberate: on extraction failure the photo is already on Drive (kept under
  FinTrack/Receipts). Documented inline.
- Added `import type { CategoryHint, ReceiptScanResult }`.

### `src/shared/bot/replies.ts`
- `receiptReceived()` → `📸 Struk diterima. / Sedang dibaca…`

### `src/app/api/bot/whatsapp/route.ts`
- `sendMessage` now returns `Promise<string | null>` (parses `body.results.message_id`).
- New `editMessage(chatId, messageId, reply)` → `POST /message/{id}/update` `{phone,
  message}`, falls back to `sendMessage` on `!res.ok` or throw.
- `processMessage`: a photo sends the `receiptReceived()` placeholder first, keeps its
  id, then `editMessage`s it with the final reply (`sendMessage` if no id). Text gets
  no placeholder. `placeholderId` hoisted above the try. Added `replies` import.

### `src/app/api/bot/telegram/route.ts`
- `callTelegram` now returns `Promise<unknown>` (parsed json or null).
- New `sendMessageReturningId(chatId, reply): Promise<number | null>` reading
  `body.result.message_id`.
- `handleTextOrPhotoMessage`: photo sends placeholder via `sendMessageReturningId`,
  then reuses the existing `editMessage` (`editMessageText`) with the final reply.
  Added `replies` import.

### Tests
- `whatsapp-message.test.ts`: `beforeEach` fetch mock now returns
  `{ results: { message_id: 'ph1' } }` so the placeholder id resolves. The media-fail
  test now asserts the error text lands in *some* `/send/message` body (a photo now
  emits a placeholder send first). Added the brief's 3 placeholder tests.
- `telegram-callback.test.ts`: mocked `@/shared/bot/media-telegram`
  (`downloadTelegramPhoto`); added a `photo → sendMessage + editMessageText` test and a
  `text → no editMessageText` test.

## Gates
- `npx vitest run src/app/api/bot src/shared/bot/flow-write.test.ts` — 56 passed
- `npx vitest run` — 561 passed (was 556; +5 new tests)
- `npx tsc --noEmit` — clean
- `npx next lint --dir src` — clean

## Concerns
- The WhatsApp `processMessage` catch block still sends the error as a fresh message,
  leaving the stale placeholder above it. This matches the brief's exact code and the
  rule ("stale placeholder must never be the *last* thing seen") holds, but a stale
  "Struk diterima" bubble does linger. Could edit-in-place on error too if desired.
- `body.results.message_id` shape for GOWA's `/send/message` is taken from the brief
  (verified in the sibling repo), not observed live here.
