import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateWithRouter = vi.fn()
vi.mock('@/shared/lib/gemini-router', () => ({
  generateWithRouter: (...a: unknown[]) => generateWithRouter(...a),
}))

vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}))

// Imported after the mock so the module under test picks up the mocked router.
const { extractReceipt, isAiQuotaOrOverloadError } = await import('./receipt-extraction')

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
    generateWithRouter.mockReset()
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
    generateWithRouter
      .mockResolvedValueOnce(extractionResult({ confidence: 0.9 }))
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.extraction.confidence).toBe(90)
  })

  it('flags a low-confidence extraction as likely not a receipt, and skips mapping entirely', async () => {
    generateWithRouter.mockResolvedValueOnce(extractionResult({ confidence: 5, items: [], total: 0 }))

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.totalConfidence).toBe(5)
    expect(result.warnings).toContain('Sepertinya ini bukan struk belanja, atau gambarnya terlalu tidak jelas.')
    // Confidence < 20 means mapping is not worth a second call — only one router call happened.
    expect(generateWithRouter).toHaveBeenCalledTimes(1)
  })

  it('rejects a mapped categoryId the user does not actually own', async () => {
    generateWithRouter
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({
        text: JSON.stringify([{ itemIndex: 0, categoryId: 'made-up-id', confidence: 90 }]),
      })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.mappedItems[0].suggestedCategoryId).toBeNull()
    expect(result.mappedItems[0].mappingConfidence).toBe(0)
  })

  it('accepts a mapped categoryId that exists in the caller-supplied category list', async () => {
    generateWithRouter
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({
        text: JSON.stringify([{ itemIndex: 0, categoryId: 'cat-food', confidence: 85 }]),
      })

    const result = await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])
    expect(result.mappedItems[0].suggestedCategoryId).toBe('cat-food')
    expect(result.mappedItems[0].suggestedPillar).toBe('needs')
  })

  it('warns when the receipt total does not match the sum of mapped items', async () => {
    generateWithRouter
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

  it('reads the image on the vision tier and maps categories on the text tier', async () => {
    generateWithRouter
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])

    expect(generateWithRouter.mock.calls[0][0]).toBe('vision')
    expect(generateWithRouter.mock.calls[1][0]).toBe('text')
  })

  it('passes the prompt and image through to the router as contents', async () => {
    generateWithRouter
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])

    const visionContents = generateWithRouter.mock.calls[0][1].contents
    expect(visionContents[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'base64' })
  })
})

describe('isAiQuotaOrOverloadError', () => {
  it('is true for a 429 or 503 numeric status', () => {
    expect(isAiQuotaOrOverloadError(Object.assign(new Error('x'), { status: 429 }))).toBe(true)
    expect(isAiQuotaOrOverloadError(Object.assign(new Error('x'), { status: 503 }))).toBe(true)
  })

  it('is true when only the message body carries the signal', () => {
    expect(isAiQuotaOrOverloadError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true)
    expect(isAiQuotaOrOverloadError(new Error('model is UNAVAILABLE'))).toBe(true)
  })

  it('is false for other errors', () => {
    expect(isAiQuotaOrOverloadError(Object.assign(new Error('bad'), { status: 400 }))).toBe(false)
    expect(isAiQuotaOrOverloadError(new Error('network blip'))).toBe(false)
    expect(isAiQuotaOrOverloadError(null)).toBe(false)
  })
})
