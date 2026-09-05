import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadWhatsAppMedia } from './media-whatsapp'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.GOWA_BASE_URL = 'https://gowa.example.com'
  process.env.GOWA_BASIC_AUTH_USER = 'admin'
  process.env.GOWA_BASIC_AUTH_PASSWORD = 'secret'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe('downloadWhatsAppMedia', () => {
  it('fetches GOWA\'s own download endpoint with Basic Auth, not a raw webhook URL/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png; charset=binary' }),
      arrayBuffer: async () => new TextEncoder().encode('fake-bytes').buffer,
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('msg-123')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gowa.example.com/message/msg-123/download',
      expect.objectContaining({ headers: { Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` } }),
    )
    expect(result.mimeType).toBe('image/png')
    expect(Buffer.from(result.base64, 'base64').toString()).toBe('fake-bytes')
  })

  it('falls back to image/jpeg when GOWA sends no content-type header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('msg-1')
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('throws with the actual status and response body when the download request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"code":"NOT_FOUND","message":"message not found"}',
    }) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('msg-1')).rejects.toThrow('HTTP 404')
    await expect(downloadWhatsAppMedia('msg-1')).rejects.toThrow('NOT_FOUND')
  })

  it('still throws a usable error when the failed response has no readable body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('body already consumed')
      },
    }) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('msg-1')).rejects.toThrow('HTTP 500')
  })

  it('fails loudly, not silently, if the endpoint ever returns JSON instead of raw bytes', async () => {
    // The exact response shape of this endpoint was never verifiable against GOWA's
    // own OpenAPI spec — if it turns out to be JSON-wrapped on some deployment, this
    // must surface as a clear error, not a corrupted "image" that Gemini quietly
    // fails to read later.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('msg-1')).rejects.toThrow('mengembalikan JSON')
  })

  it('throws when GOWA credentials are not configured, before ever calling fetch', async () => {
    delete process.env.GOWA_BASIC_AUTH_PASSWORD
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('msg-1')).rejects.toThrow('belum dikonfigurasi')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
