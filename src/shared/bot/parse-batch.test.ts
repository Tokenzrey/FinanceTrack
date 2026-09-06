import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/shared/types/domain'

const generateWithRouter = vi.fn()
vi.mock('@/shared/lib/gemini-router', () => ({
  generateWithRouter: (...a: unknown[]) => generateWithRouter(...a),
}))

vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}))

const { parseTransactionBatch } = await import('./parse-batch')

function cat(id: string, name: string, pillar: Category['pillar']): Category {
  return {
    id,
    name,
    pillar,
    percentOfIncome: 0,
    color: '#000',
    icon: 'star',
    isSinkingFund: false,
    isRecurring: false,
    isActive: true,
    order: 0,
    createdAt: null as never,
    updatedAt: null as never,
  }
}

const CATEGORIES = [cat('c-food', 'Makan', 'needs'), cat('c-salary', 'Gaji', 'income')]

const originalKey = process.env.GEMINI_API_KEY

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key'
  generateWithRouter.mockReset()
})

afterEach(() => {
  process.env.GEMINI_API_KEY = originalKey
})

function modelReply(lines: unknown[]) {
  return { text: JSON.stringify({ lines }) }
}

describe('parseTransactionBatch', () => {
  it('returns one ParsedLine per segment the model found', async () => {
    generateWithRouter.mockResolvedValueOnce(
      modelReply([
        { type: 'expense', description: 'makan siang', amountText: '35rb', categoryCandidates: ['c-food'], dateOffset: 0, confidence: 92 },
        { type: 'income', description: 'gaji', amountText: '5jt', categoryCandidates: ['c-salary'], dateOffset: 0, confidence: 95 },
      ]),
    )

    const out = await parseTransactionBatch('makan siang 35rb, gaji masuk 5jt', CATEGORIES)
    expect(out).toHaveLength(2)
    expect(out[0].type).toBe('expense')
    expect(out[1].type).toBe('income')
    expect(out[1].amountText).toBe('5jt')
  })

  it('keeps transfer as its own type', async () => {
    generateWithRouter.mockResolvedValueOnce(
      modelReply([{ type: 'transfer', description: 'pindah ke bca', amountText: '1jt', categoryCandidates: [], dateOffset: 0, confidence: 80 }]),
    )
    const out = await parseTransactionBatch('pindah ke bca 1jt', CATEGORIES)
    expect(out[0].type).toBe('transfer')
  })

  it('drops category ids the user does not actually own', async () => {
    generateWithRouter.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: '10rb', categoryCandidates: ['made-up', 'c-food'], dateOffset: 0, confidence: 70 }]),
    )
    const out = await parseTransactionBatch('x 10rb', CATEGORIES)
    expect(out[0].categoryCandidates).toEqual(['c-food'])
  })

  it('never lets a numeric field from the model become the amount', async () => {
    // The model is told to return a substring; if it returns junk, the line still only
    // carries text — `draft.ts` re-parses it and drops the line when it cannot.
    generateWithRouter.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: 99999, categoryCandidates: [], dateOffset: 0, confidence: 50 }]),
    )
    const out = await parseTransactionBatch('x sekian', CATEGORIES)
    expect(typeof out[0].amountText).toBe('string')
  })

  it('falls back to one whole-message line when the model call fails', async () => {
    generateWithRouter.mockRejectedValueOnce(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }))

    const out = await parseTransactionBatch('makan siang 35rb', CATEGORIES)
    expect(out).toEqual([
      { type: 'expense', description: null, amountText: 'makan siang 35rb', categoryCandidates: [], dateOffset: 0, confidence: 0 },
    ])
  })

  it('falls back the same way when GEMINI_API_KEY is missing, without calling the SDK', async () => {
    delete process.env.GEMINI_API_KEY
    const out = await parseTransactionBatch('kopi 20rb', CATEGORIES)
    expect(out).toHaveLength(1)
    expect(out[0].amountText).toBe('kopi 20rb')
    expect(generateWithRouter).not.toHaveBeenCalled()
  })

  it('falls back when the model answers with an empty or malformed lines array', async () => {
    generateWithRouter.mockResolvedValueOnce(modelReply([]))
    expect((await parseTransactionBatch('kopi 20rb', CATEGORIES))[0].amountText).toBe('kopi 20rb')

    generateWithRouter.mockResolvedValueOnce({ text: 'not json at all' })
    expect((await parseTransactionBatch('kopi 20rb', CATEGORIES))[0].amountText).toBe('kopi 20rb')
  })

  it('clamps dateOffset and confidence into sane ranges', async () => {
    generateWithRouter.mockResolvedValueOnce(
      modelReply([{ type: 'expense', description: 'x', amountText: '10rb', categoryCandidates: [], dateOffset: -9999, confidence: 5000 }]),
    )
    const out = await parseTransactionBatch('x 10rb', CATEGORIES)
    expect(out[0].dateOffset).toBe(-365)
    expect(out[0].confidence).toBe(100)
  })

  it('defaults an unrecognised type to expense', async () => {
    generateWithRouter.mockResolvedValueOnce(
      modelReply([{ type: 'donation', description: 'x', amountText: '10rb', categoryCandidates: [], dateOffset: 0, confidence: 50 }]),
    )
    expect((await parseTransactionBatch('x 10rb', CATEGORIES))[0].type).toBe('expense')
  })
})
