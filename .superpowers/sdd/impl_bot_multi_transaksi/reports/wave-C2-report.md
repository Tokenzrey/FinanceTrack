# Adversarial wave C.2 — final

Branch `feat/bot-multi-transaksi`. Base HEAD `662ef79`. One commit.

Gates: `npx vitest run` 650/650 green (37 files) · `npx tsc --noEmit` 0 · `npx next lint --dir src` clean · `npx vitest run src/app/api/bot` 39/39.

## Per-item

| # | Finding | Status |
|---|---------|--------|
| 1 | Router honesty (NH W1/W2) — provisional wording kept in both comments, "Verified" claim deleted, both point at `GEMINI_MODELS_VISION`/`GEMINI_MODELS_TEXT` + the script. Roster left as the exact 6 vision + 3 text ids from `662ef79`, plus the two documented `-latest` last-resort appends only. `configureRouterIO` comment now says `core.ts` `handleIncoming`, every message, idempotently. | done |
| 2 | Cooldown → `aiUnavailable` (Sab N8) — `generateWithRouter` now throws `Object.assign(new Error('all Gemini models temporarily unavailable'), { status: 503 })` when zero calls succeeded and `pickModel` returned null on a populated roster; plain error kept only for an empty roster. Test: all models `cooldownUntil > now` → rejection accepted by `isAiQuotaOrOverloadError`. | done |
| 3 | Roster-shape test (NH W1) — `DEFAULT_ROSTER` exported; new test asserts every id (both tiers) matches `/^gemini-[0-9.]+-flash(-lite)?$|^gemini-flash(-lite)?-latest$/`. | done |
| 4 | Log `error.message` (Sec N5) — every `console.error('<prefix>', error)` in `whatsapp/route.ts`, `telegram/route.ts`, `flow-write.ts`, `flow-review.ts`, `parse-batch.ts`, `drive-upload.ts` now logs `error instanceof Error ? error.message : error`, prefixes verbatim. `gemini-router.ts` has no `console.error(prefix, error)` call (only a `console.warn` with a string) — nothing to change there. | done |
| 5 | `firestore.rules` (Sec W4) — client write-deny extended to `meta/botLastBatch`, `meta/botPrefs`, `meta/botModelDay`, and any doc whose first segment is `bot_receipt_cache`/`bot_parse_cache`. `meta/scan_hints` kept client-writable. Added top-level `bot_meta/{doc}` and `bot_processed_messages/{doc}` deny-all blocks. Comment lists every Admin-SDK-only `meta/*` doc and why. Reads still allowed. | done |
| 6a | Merge-write ledger (Sec W1 / Sab W9) — `saveModelHealth(dayKey, modelId, state)` merge-writes only the touched model; `state === null` does the whole-doc Pacific-rollover reset. `RouterIO.save` retyped to match (`state: ModelHealth \| null`); `core.ts` wiring `save: adminData.saveModelHealth` still type-checks unchanged, so `core.ts` was NOT touched. `generateWithRouter` calls `io.save(today, spec.id, models[spec.id])` per attempt (success + failure) and `io.save(today, '', null)` once on rollover before proceeding. `noteSuccess`/`noteFailure` unchanged (still return the full map). Tests updated in `gemini-router.test.ts` + `admin-data.test.ts`. | done |
| 6b | Per-user daily AI cap (Sec W1 / Sab W9) — `DAILY_USER_MODEL_CAP = 40` (exported) + `bumpUserModelCalls(userId)` on `users/{uid}/meta/botModelDay` `{ day, count }` keyed on `dayKeyInTz(new Date(), 'America/Los_Angeles')`: new day → `set({day, count:1})` return 1; same day → `set({count: increment(1)}, {merge:true})` + re-read. `flow-write.ts` calls it immediately before the L1 `parseTransactionBatch` (inside the cache-miss branch) and before `extractReceipt` in `handlePhoto` (inside the cache-miss branch); `n > cap` → `replies.dailyAiLimit()`. L0 and cache hits never bump. `replies.dailyAiLimit()` added. Tests: 41 → `dailyAiLimit`, model not called; L0 hit + cache hit → no bump; admin-data reset/increment. | done |
| 7 | Link-code CSPRNG + create-not-overwrite (Sec N6) — `randomLinkCode` uses `randomInt(0, alphabet.length)` (`node:crypto`); `createLinkCode` retries up to 5 fresh codes with `.create()`, catches gRPC `err.code === 6` and retries, throws after 5. Alphabet + length unchanged. Test: retries past one simulated `code:6` then succeeds. | done |

## Note

The working copy of `src/shared/lib/gemini-router.ts` was found mid-task with `DEFAULT_ROSTER`
rewritten to a different, larger set of fabricated/`-preview`/`-pro` model ids (not present in
`662ef79`, and failing item 3's regex). This contradicted the explicit scope ("Absolutely no
changes to any `DEFAULT_ROSTER` id except the two `-latest` appends" / "DO NOT invent model
ids"), so the roster was restored to the `662ef79` baseline + the two sanctioned `-latest`
entries. No other part of that file was affected.

## Files touched (13)

`src/shared/lib/gemini-router.ts`, `src/shared/lib/gemini-router.test.ts`,
`src/shared/bot/admin-data.ts`, `src/shared/bot/admin-data.test.ts`,
`src/shared/bot/flow-write.ts`, `src/shared/bot/flow-write.test.ts`,
`src/shared/bot/replies.ts`, `src/shared/bot/flow-review.ts`,
`src/shared/bot/parse-batch.ts`, `src/shared/bot/drive-upload.ts`,
`src/app/api/bot/whatsapp/route.ts`, `src/app/api/bot/telegram/route.ts`,
`firestore.rules`.
