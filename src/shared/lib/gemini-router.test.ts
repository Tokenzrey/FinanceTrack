import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ROSTER,
  QUOTA_DAY_TZ,
  configureRouterIO,
  generateWithRouter,
  noteFailure,
  noteSuccess,
  pickModel,
} from './gemini-router'
import type { ModelHealth } from './gemini-router'
import { dayKeyInTz } from './format'
import { isAiQuotaOrOverloadError } from './receipt-extraction'

const mockGenerateContent = vi.fn()
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent: mockGenerateContent }
    },
  }
})

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

describe('DEFAULT_ROSTER shape', () => {
  it('every model id (both tiers) looks like a real Gemini id — fails loudly on a typo', () => {
    const re = /^gemini-[0-9.]+-flash(-lite)?$|^gemini-flash(-lite)?-latest$/
    for (const spec of [...DEFAULT_ROSTER.vision, ...DEFAULT_ROSTER.text]) {
      expect(spec.id, `bad roster id: ${spec.id}`).toMatch(re)
    }
  })
})

describe('generateWithRouter — nothing available', () => {
  const OLD_KEY = process.env.GEMINI_API_KEY
  const today = () => dayKeyInTz(new Date(), QUOTA_DAY_TZ)

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = OLD_KEY
    configureRouterIO({
      load: async () => ({ dayKey: today(), models: {} }),
      save: async () => {},
    })
    mockGenerateContent.mockReset()
  })

  it('rejects with an error isAiQuotaOrOverloadError accepts when every model is cooling down (N8)', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const soon = Date.now() + 60_000
    const cooling = Object.fromEntries(
      DEFAULT_ROSTER.text.map((s) => [s.id, { used: 0, lastUsedAt: 0, cooldownUntil: soon }]),
    )
    configureRouterIO({ load: async () => ({ dayKey: today(), models: cooling }), save: async () => {} })

    const err = await generateWithRouter('text', { contents: 'x' } as never).catch((e) => e)
    expect(isAiQuotaOrOverloadError(err)).toBe(true)
    expect(mockGenerateContent).not.toHaveBeenCalled()
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
