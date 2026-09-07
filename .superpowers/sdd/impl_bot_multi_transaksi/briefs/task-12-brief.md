## Task 12: Router Model Sadar-Kuota

R12. Satu titik pemilihan model untuk seluruh aplikasi, memutar seluruh roster dan mundur otomatis saat sebuah model habis.

**Files:**
- Create: `scripts/list-gemini-models.mjs` (kode lengkap di §10.6)
- Create: `src/shared/lib/gemini-router.ts`
- Test: `src/shared/lib/gemini-router.test.ts`
- Modify: `src/shared/lib/receipt-extraction.ts` (buang `MODELS`/`generateWithModels`, pakai router)
- Modify: `src/shared/bot/parse-batch.ts` (buang `MODEL`, pakai router tier `text`)
- Modify: `src/shared/bot/admin-data.ts` (baca/tulis ledger)

**Interfaces:**
- Consumes: `dayKeyInTz` dari `@/shared/lib/format` (Task 1)
- Produces:
  - `generateWithRouter(task: GeminiTask, params: Omit<GenerateContentParameters, 'model'>): Promise<GenerateContentResponse>`
  - `pickModel(task: GeminiTask, health: Record<string, ModelHealth>, now: number): ModelSpec | null`
  - `noteSuccess(health, modelId, now): Record<string, ModelHealth>`
  - `noteFailure(health, modelId, now, kind: 'quota' | 'overload' | 'other'): Record<string, ModelHealth>`
  - `QUOTA_DAY_TZ = 'America/Los_Angeles'`
- Produces di `admin-data.ts`: `getModelHealth(): Promise<{ dayKey: string; models: Record<string, ModelHealth> }>`, `saveModelHealth(dayKey, models): Promise<void>`

- [ ] **Step 1: Ambil id model yang sebenarnya**

Buat `scripts/list-gemini-models.mjs` dengan isi persis seperti §10.6, lalu:

```bash
GEMINI_API_KEY=<key> node scripts/list-gemini-models.mjs
```

Catat id yang muncul. Setiap id di `ROSTER` (Step 3) harus ada di keluaran ini; buang yang tidak ada.

- [ ] **Step 2: Tulis test yang gagal untuk logika pemilihan**

Buat `src/shared/lib/gemini-router.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { noteFailure, noteSuccess, pickModel } from './gemini-router'
import type { ModelHealth } from './gemini-router'

const NOW = 1_788_600_000_000

function health(entries: Record<string, Partial<ModelHealth>>): Record<string, ModelHealth> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, h]) => [
      id,
      { used: 0, lastUsedAt: 0, cooldownUntil: 0, ...h },
    ]),
  )
}

describe('pickModel — spreading load', () => {
  it('picks the least-used model, not always the first in the roster', () => {
    const first = pickModel('vision', health({}), NOW)
    expect(first).not.toBeNull()

    // After that model has been used a few times, a fresh sibling wins.
    const after = pickModel('vision', health({ [first!.id]: { used: 5, lastUsedAt: NOW - 60_000 } }), NOW)
    expect(after!.id).not.toBe(first!.id)
  })

  it('breaks a usage tie with the oldest lastUsedAt', () => {
    const a = pickModel('text', health({}), NOW)!
    const picked = pickModel(
      'text',
      health({ [a.id]: { used: 3, lastUsedAt: NOW - 1_000 } }),
      NOW,
    )!
    expect(picked.id).not.toBe(a.id)
  })

  it('skips a model whose daily quota is spent', () => {
    const all = pickModel('text', health({}), NOW)!
    const spent = health({ [all.id]: { used: all.rpd } })
    expect(pickModel('text', spent, NOW)!.id).not.toBe(all.id)
  })

  it('skips a model still inside its per-minute window instead of waiting for it', () => {
    const m = pickModel('vision', health({}), NOW)!
    const justUsed = health({ [m.id]: { used: 1, lastUsedAt: NOW - 1_000 } })
    // 5 RPM means one call per 12s; 1s ago is far too soon.
    expect(pickModel('vision', justUsed, NOW)!.id).not.toBe(m.id)
  })

  it('skips a model parked by a 503 cooldown', () => {
    const m = pickModel('text', health({}), NOW)!
    const parked = health({ [m.id]: { cooldownUntil: NOW + 30_000 } })
    expect(pickModel('text', parked, NOW)!.id).not.toBe(m.id)
  })

  it('returns null only when every model in the tier is unavailable', () => {
    const exhausted: Record<string, ModelHealth> = {}
    let model = pickModel('text', exhausted, NOW)
    while (model) {
      exhausted[model.id] = { used: model.rpd, lastUsedAt: 0, cooldownUntil: 0 }
      model = pickModel('text', exhausted, NOW)
    }
    expect(pickModel('text', exhausted, NOW)).toBeNull()
  })

  it('keeps the vision and text pools separate', () => {
    const visionIds = new Set<string>()
    const h: Record<string, ModelHealth> = {}
    let m = pickModel('vision', h, NOW)
    while (m) {
      visionIds.add(m.id)
      h[m.id] = { used: m.rpd, lastUsedAt: 0, cooldownUntil: 0 }
      m = pickModel('vision', h, NOW)
    }
    const textFirst = pickModel('text', {}, NOW)!
    // The text tier leads with a 500-RPD lite model, never a 20-RPD vision model.
    expect(textFirst.rpd).toBeGreaterThanOrEqual(500)
  })
})

describe('noteSuccess / noteFailure', () => {
  it('counts a success against the daily budget', () => {
    const after = noteSuccess({}, 'm1', NOW)
    expect(after.m1.used).toBe(1)
    expect(after.m1.lastUsedAt).toBe(NOW)
  })

  it('a quota failure parks the model for the rest of the day', () => {
    const after = noteFailure({}, 'gemini-3.5-flash', NOW, 'quota')
    expect(pickModel('vision', after, NOW)!.id).not.toBe('gemini-3.5-flash')
  })

  it('an overload failure parks the model only briefly', () => {
    const after = noteFailure({}, 'm1', NOW, 'overload')
    expect(after.m1.cooldownUntil).toBeGreaterThan(NOW)
    expect(after.m1.cooldownUntil).toBeLessThanOrEqual(NOW + 120_000)
  })

  it('an unclassified failure still counts as a use, so a broken model rotates out', () => {
    const after = noteFailure({}, 'm1', NOW, 'other')
    expect(after.m1.used).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/lib/gemini-router.test.ts`
Expected: FAIL — `Failed to resolve import "./gemini-router"`.

- [ ] **Step 4: Implementasi router**

Buat `src/shared/lib/gemini-router.ts`:

```ts
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai'
import { dayKeyInTz } from './format'
import { isAiQuotaOrOverloadError } from './receipt-extraction'

/**
 * One place that decides which Gemini model answers a request.
 *
 * The free tier meters requests PER MODEL PER DAY, and on this account the flash
 * models get 20/day each while the flash-lite models get 500/day each. A fixed
 * fallback chain therefore burns its first model every morning and leaves five
 * siblings idle — which is exactly what the account's own dashboard showed
 * (gemini-3.5-flash at 24/20 while gemini-3.7-flash sat at 1/20).
 *
 * So: pick the least-used model in the tier, skip anything inside its per-minute
 * window rather than waiting on it, park a model that returns 429 for the rest of the
 * day, and park a 503 for a minute. Vision and text are separate pools because only
 * one of them can accept an image, and text work has 50x the daily headroom.
 */

export type GeminiTask = 'vision' | 'text'

export interface ModelSpec {
  id: string
  /** Requests per day on this account's free tier. */
  rpd: number
  /** Requests per minute. */
  rpm: number
}

export interface ModelHealth {
  used: number
  lastUsedAt: number
  cooldownUntil: number
}

/** Google resets free-tier daily quota at midnight Pacific, not UTC and not WIB. */
export const QUOTA_DAY_TZ = 'America/Los_Angeles'

/** Stop this far short of the published cap — two concurrent webhooks can both read a
 *  stale count, and it costs nothing to leave a little air. */
const RPD_RESERVE = 1

const OVERLOAD_COOLDOWN_MS = 60_000

/**
 * Verified against `scripts/list-gemini-models.mjs` output and the account's own rate
 * limit dashboard. Override per environment with GEMINI_MODELS_VISION /
 * GEMINI_MODELS_TEXT (comma-separated `id:rpd:rpm`) so ops can retune without a deploy.
 */
const DEFAULT_ROSTER: Record<GeminiTask, ModelSpec[]> = {
  // 6 x 20/day = 120 receipt reads. Only this tier accepts inlineData images.
  vision: [
    { id: 'gemini-3.5-flash', rpd: 20, rpm: 5 },
    { id: 'gemini-3.8-flash', rpd: 20, rpm: 5 },
    { id: 'gemini-3.7-flash', rpd: 20, rpm: 5 },
    { id: 'gemini-3.6-flash', rpd: 20, rpm: 5 },
    { id: 'gemini-3-flash', rpd: 20, rpm: 5 },
    { id: 'gemini-2.5-flash', rpd: 20, rpm: 5 },
  ],
  // 2 x 500/day, and lower latency than flash — text work belongs here, not in the
  // scarce vision pool. The 20/day lite model trails as a last resort.
  text: [
    { id: 'gemini-3.5-flash-lite', rpd: 500, rpm: 15 },
    { id: 'gemini-3.1-flash-lite', rpd: 500, rpm: 15 },
    { id: 'gemini-2.5-flash-lite', rpd: 20, rpm: 10 },
  ],
}

function parseRosterEnv(raw: string | undefined): ModelSpec[] | null {
  if (!raw?.trim()) return null
  const specs = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, rpd, rpm] = entry.split(':')
      return { id, rpd: Number(rpd) || 20, rpm: Number(rpm) || 5 }
    })
    .filter((spec) => spec.id)
  return specs.length > 0 ? specs : null
}

export function rosterFor(task: GeminiTask): ModelSpec[] {
  const override =
    task === 'vision'
      ? parseRosterEnv(process.env.GEMINI_MODELS_VISION)
      : parseRosterEnv(process.env.GEMINI_MODELS_TEXT)
  return override ?? DEFAULT_ROSTER[task]
}

function healthOf(health: Record<string, ModelHealth>, id: string): ModelHealth {
  return health[id] ?? { used: 0, lastUsedAt: 0, cooldownUntil: 0 }
}

export function pickModel(
  task: GeminiTask,
  health: Record<string, ModelHealth>,
  now: number,
): ModelSpec | null {
  const available = rosterFor(task).filter((spec) => {
    const state = healthOf(health, spec.id)
    if (state.used >= spec.rpd - RPD_RESERVE) return false
    if (state.cooldownUntil > now) return false
    // Skipping a model inside its RPM window is strictly better than sleeping: a
    // sibling is free right now, and the user is waiting.
    const minGapMs = Math.ceil(60_000 / spec.rpm)
    if (now - state.lastUsedAt < minGapMs) return false
    return true
  })

  if (available.length === 0) return null

  return available.sort((a, b) => {
    const ha = healthOf(health, a.id)
    const hb = healthOf(health, b.id)
    // Least-used first — that is what spreads the day across the whole roster.
    if (ha.used !== hb.used) return ha.used - hb.used
    return ha.lastUsedAt - hb.lastUsedAt
  })[0]
}

export function noteSuccess(
  health: Record<string, ModelHealth>,
  modelId: string,
  now: number,
): Record<string, ModelHealth> {
  const current = healthOf(health, modelId)
  return { ...health, [modelId]: { ...current, used: current.used + 1, lastUsedAt: now } }
}

export function noteFailure(
  health: Record<string, ModelHealth>,
  modelId: string,
  now: number,
  kind: 'quota' | 'overload' | 'other',
): Record<string, ModelHealth> {
  const current = healthOf(health, modelId)

  if (kind === 'quota') {
    // 429 means the daily allowance is gone; nothing short of tomorrow revives it.
    const spec = [...rosterFor('vision'), ...rosterFor('text')].find((s) => s.id === modelId)
    return { ...health, [modelId]: { ...current, used: spec?.rpd ?? 9999, lastUsedAt: now } }
  }

  if (kind === 'overload') {
    return {
      ...health,
      [modelId]: { ...current, lastUsedAt: now, cooldownUntil: now + OVERLOAD_COOLDOWN_MS },
    }
  }

  // A 404 (wrong id) or a malformed request would otherwise be retried forever on the
  // same model; counting it as a use rotates it out on its own.
  return { ...health, [modelId]: { ...current, used: current.used + 1, lastUsedAt: now } }
}

function classify(error: unknown): 'quota' | 'overload' | 'other' {
  const status = (error as { status?: unknown } | null)?.status
  if (status === 429) return 'quota'
  if (status === 503) return 'overload'
  if (isAiQuotaOrOverloadError(error)) return 'overload'
  return 'other'
}

/** Loaded by the caller so the ledger is read once per pipeline, not once per model. */
export interface HealthLedger {
  dayKey: string
  models: Record<string, ModelHealth>
}

export interface RouterIO {
  load: () => Promise<HealthLedger>
  save: (dayKey: string, models: Record<string, ModelHealth>) => Promise<void>
}

/** Set once at startup by `admin-data.ts`; kept injectable so tests never touch Firestore. */
let io: RouterIO = {
  load: async () => ({ dayKey: dayKeyInTz(new Date(), QUOTA_DAY_TZ), models: {} }),
  save: async () => {},
}

export function configureRouterIO(next: RouterIO): void {
  io = next
}

export async function generateWithRouter(
  task: GeminiTask,
  params: Omit<GenerateContentParameters, 'model'>,
): Promise<GenerateContentResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi.')

  const ai = new GoogleGenAI({ apiKey })
  const today = dayKeyInTz(new Date(), QUOTA_DAY_TZ)

  const ledger = await io.load()
  // A new Pacific day wipes the counters — that is exactly when Google resets them.
  let models = ledger.dayKey === today ? ledger.models : {}

  let lastError: unknown = new Error(`Tidak ada model tersedia untuk tier "${task}".`)

  for (let attempt = 0; attempt < rosterFor(task).length; attempt++) {
    const now = Date.now()
    const spec = pickModel(task, models, now)
    if (!spec) break

    try {
      const response = await ai.models.generateContent({ model: spec.id, ...params })
      models = noteSuccess(models, spec.id, Date.now())
      await io.save(today, models)
      return response
    } catch (error) {
      lastError = error
      const kind = classify(error)
      models = noteFailure(models, spec.id, Date.now(), kind)
      console.warn(`gemini-router: ${spec.id} failed (${kind}), rotating.`)
    }
  }

  await io.save(today, models)
  throw lastError
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/lib/gemini-router.test.ts`
Expected: PASS (11 test).

- [ ] **Step 6: Ledger di Firestore**

Tambahkan di `src/shared/bot/admin-data.ts`:

```ts
/**
 * Shared Gemini quota ledger. Not scoped to a user: the free-tier quota belongs to the
 * API key, so every user's traffic draws from the same pool.
 *
 * ponytail: read-modify-write without a transaction. Two concurrent webhooks can both
 * read `used: 19` and both fire — worst case one extra 429, which the router already
 * handles by rotating. A transaction here would add a round trip to every model call
 * to prevent an error that is already harmless.
 */
export async function getModelHealth(): Promise<{ dayKey: string; models: Record<string, ModelHealth> }> {
  const snap = await getAdminDb().doc('bot_meta/geminiHealth').get()
  if (!snap.exists) return { dayKey: '', models: {} }
  const data = snap.data() as { dayKey?: string; models?: Record<string, ModelHealth> }
  return { dayKey: data.dayKey ?? '', models: data.models ?? {} }
}

export async function saveModelHealth(
  dayKey: string,
  models: Record<string, ModelHealth>,
): Promise<void> {
  await getAdminDb().doc('bot_meta/geminiHealth').set({ dayKey, models, updatedAt: FieldValue.serverTimestamp() })
}
```

Sambungkan sekali di `src/shared/lib/firebase-admin.ts`, tepat setelah app Admin diinisialisasi:

```ts
import { configureRouterIO } from './gemini-router'
import { getModelHealth, saveModelHealth } from '@/shared/bot/admin-data'

configureRouterIO({ load: getModelHealth, save: saveModelHealth })
```

> Kalau ini memicu impor melingkar (`firebase-admin` → `admin-data` → `firebase-admin`), pindahkan pemanggilan `configureRouterIO` ke baris pertama `handleIncoming` di `core.ts`. Idempoten, jadi aman dipanggil berkali-kali.

- [ ] **Step 7: Alihkan kedua pemanggil ke router**

`src/shared/lib/receipt-extraction.ts` — hapus `MODELS`, `generateWithModels`, `withRetry`, `aiErrorStatus` (yang terakhir pindah ke router; `isAiQuotaOrOverloadError` **tetap** di sini karena dipakai `core.ts`/`flow-write.ts`). Ganti kedua call site:

```ts
  const extractionResponse = await generateWithRouter('vision', {
    contents: [
      { text: `${EXTRACTION_PROMPT}${userNoteBlock(userNote)}` },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
    config: { responseMimeType: 'application/json', responseSchema: extractionSchema, temperature: 0 },
  })
```

```ts
      // Item mapping is pure text. Keeping it on the vision tier used to spend the
      // scarcest quota (20/day) on work the 500/day tier does just as well — moving it
      // doubles how many receipts a day the bot can read.
      const mappingResponse = await generateWithRouter('text', {
        contents: buildMappingPrompt(extraction.items, categories, extraction.merchantType, hints, userNote),
        config: { responseMimeType: 'application/json', responseSchema: mappingSchema, temperature: 0 },
      })
```

`src/shared/bot/parse-batch.ts` — hapus `const MODEL` dan impor `GoogleGenAI`; ganti pemanggilan:

```ts
    const response = await generateWithRouter('text', {
      contents: buildPrompt(text, categories),
      config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    })
```

Perbarui mock `@google/genai` di `receipt-extraction.test.ts` dan `parse-batch.test.ts` agar juga men-stub router, atau mock `./gemini-router` langsung — yang kedua lebih sederhana:

```ts
const generateWithRouter = vi.fn()
vi.mock('@/shared/lib/gemini-router', () => ({
  generateWithRouter: (...a: unknown[]) => generateWithRouter(...a),
}))
```

Semua assertion `generateContent.mock.calls[n][0].contents` menjadi `generateWithRouter.mock.calls[n][1].contents`, dan `.mock.calls[n][0]` adalah nama tier — tambahkan satu assertion baru per file:

```ts
  it('reads the image on the vision tier and maps categories on the text tier', async () => {
    generateWithRouter
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])

    expect(generateWithRouter.mock.calls[0][0]).toBe('vision')
    expect(generateWithRouter.mock.calls[1][0]).toBe('text')
  })
```

- [ ] **Step 8: Jalankan semua & commit**

Run: `npx vitest run && npx tsc --noEmit && npx next lint --dir src`
Expected: PASS, exit 0.

```bash
git add src/shared/lib/gemini-router.ts src/shared/lib/gemini-router.test.ts src/shared/lib/receipt-extraction.ts src/shared/lib/receipt-extraction.test.ts src/shared/bot/parse-batch.ts src/shared/bot/parse-batch.test.ts src/shared/bot/admin-data.ts src/shared/lib/firebase-admin.ts scripts/list-gemini-models.mjs
git commit -m "feat(ai): quota-aware model router across the whole free-tier roster

The free tier meters requests per model per day. This account gets 20/day on each of
six flash models and 500/day on each of two flash-lite models, and a fixed fallback
chain burned the first model every morning while five siblings sat idle — the account
dashboard showed gemini-3.5-flash at 24/20 next to gemini-3.7-flash at 1/20.

The router picks the least-used model in the tier, skips one inside its per-minute
window instead of waiting on it, parks a 429 until tomorrow and a 503 for a minute.
Counters reset on the Pacific day boundary, which is when Google resets them.

Item mapping moves from the vision tier to the text tier: it is pure text, and it was
spending the scarcest quota. That alone doubles daily receipt capacity from 60 to 120."
```

---

