import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: { models: { generateContent: typeof generateContent } }) {
    this.models = { generateContent }
  }),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}))

// Imported after the mock so the module under test picks up the mocked SDK.
const { extractReceipt } = await import('./receipt-extraction')

const CATEGORIES = [
  { id: 'cat-food', name: 'Makan & Minum', pillar: 'needs' as const },
  { id: 'cat-transport', name: 'Transportasi', pillar: 'needs' as const },
]

function extractionResult(overrides: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify({
      merchant: 'Indomaret',
      merchantType: 'supermarket',
      date: '2026-09-01',
      items: [{ name: 'Kopi', totalPrice: 20000 }],
      total: 20000,
      confidence: 90,
      language: 'id',
      rawText: 'INDOMARET\nKopi 20000\nTOTAL 20000',
      ...overrides,
    }),
  }
}

describe('extractReceipt', () => {
  const originalKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    generateContent.mockReset()
  })

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey
  })

  it('throws when GEMINI_API_KEY is not configured', async () => {
    delete process.env.GEMINI_API_KEY
    await expect(extractReceipt('base64', 'image/jpeg', [], [])).rejects.toThrow(
      'GEMINI_API_KEY belum dikonfigurasi.',
    )
  })

  it('normalises a 0-1 confidence to 0-100', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult({ confidence: 0.9 }))
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.extraction.confidence).toBe(90)
  })

  it('flags a low-confidence extraction as likely not a receipt, and skips mapping entirely', async () => {
    generateContent.mockResolvedValueOnce(extractionResult({ confidence: 5, items: [], total: 0 }))

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.totalConfidence).toBe(5)
    expect(result.warnings).toContain('Sepertinya ini bukan struk belanja, atau gambarnya terlalu tidak jelas.')
    // Confidence < 20 means mapping is not worth a second call — only one generateContent call happened.
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('rejects a mapped categoryId the user does not actually own', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({
        text: JSON.stringify([{ itemIndex: 0, categoryId: 'made-up-id', confidence: 90 }]),
      })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.mappedItems[0].suggestedCategoryId).toBeNull()
    expect(result.mappedItems[0].mappingConfidence).toBe(0)
  })

  it('accepts a mapped categoryId that exists in the caller-supplied category list', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({
        text: JSON.stringify([{ itemIndex: 0, categoryId: 'cat-food', confidence: 85 }]),
      })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.mappedItems[0].suggestedCategoryId).toBe('cat-food')
    expect(result.mappedItems[0].suggestedPillar).toBe('needs')
  })

  it('warns when the receipt total does not match the sum of mapped items', async () => {
    generateContent
      .mockResolvedValueOnce(
        extractionResult({
          items: [{ name: 'Kopi', totalPrice: 20000 }],
          total: 50000, // mismatched on purpose
        }),
      )
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.warnings.some((w) => w.includes('tidak cocok dengan jumlah item'))).toBe(true)
  })

  it('retries once on a transient failure, then succeeds', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('503 transient'))
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.extraction.merchant).toBe('Indomaret')
  })
})
