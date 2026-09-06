// ROSTER model ids are provisional — verify against scripts/list-gemini-models.mjs output before production use.

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
