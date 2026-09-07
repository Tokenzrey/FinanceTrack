# Task 4 Report — Parse Multi-Transaksi dari Satu Pesan Teks

**Status:** DONE
**Commit:** c4617e31d5cecfee226baffb7b25c097e10df73a (branch `feat/bot-multi-transaksi`)

## What was built
- `src/shared/bot/parse-batch.ts` — `parseTransactionBatch(text, categories): Promise<ParsedLine[]>`.
  Splits one chat message into N transaction segments via Gemini; returns `amountText`
  (literal substring, coerced to string), never a number. Never throws — missing key,
  quota error, or malformed answer degrade to one whole-message fallback line.
- `src/shared/bot/parse-batch.test.ts` — 9 tests.

## Controller ruling applied
- Model call goes through `generateWithRouter('text', { contents, config })` from
  `@/shared/lib/gemini-router` — no `GoogleGenAI` import, no `const MODEL`, no direct
  `ai.models.generateContent`.
- `import { Type } from '@google/genai'` kept (schema builder needs it), matching the
  sibling `receipt-extraction.ts` pattern.
- Early `GEMINI_API_KEY` guard kept ahead of the router (avoids a wasted ledger read).
- `isAiQuotaOrOverloadError` not imported — the brief's Step 3 code never used it, and
  the router swap doesn't introduce a need.
- Tests mock `@/shared/lib/gemini-router` (`generateWithRouter = vi.fn()`) plus a
  `Type`-only `@google/genai` stub; every `generateContent.mock*` renamed to
  `generateWithRouter.mock*`. `modelReply` helper and all assertions unchanged.

## Gates
- `npx vitest run src/shared/bot/parse-batch.test.ts` — 9 passed
- `npx vitest run` — 444 passed / 30 files (was 435; +9)
- `npx tsc --noEmit` — clean
- `npx next lint --dir src` — no warnings or errors

## Prompt / schema / normalization
Kept verbatim from the brief: `buildPrompt`, `schema` (responseSchema), `toTxType`
(unknown → expense), `clampOffset` (±365), `clampConfidence` (0–100 rounded),
`fallback`, category-id filtering against owned ids + slice(0,3), description
trim-or-null.

## Concerns
None. Downstream `draft.ts` (later task) is responsible for running `amountText`
through `parseAmount` and dropping lines it can't parse — this task only produces the
text segments, as specified.
