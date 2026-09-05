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

const AUTH = `Basic ${Buffer.from('admin:secret').toString('base64')}`

function jsonRes(results: unknown) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
    json: async () => ({ code: 'SUCCESS', results }),
  }
}

function bytesRes(contentType: string, bytes: string) {
  return {
    ok: true,
    headers: new Headers(contentType ? { 'content-type': contentType } : {}),
    arrayBuffer: async () => new TextEncoder().encode(bytes).buffer,
  }
}

describe('downloadWhatsAppMedia', () => {
  it('calls the download endpoint with ?phone= and Basic Auth, then fetches the returned file_url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          file_url: 'https://gowa.example.com/statics/media/628/2026-09-05/x.jpg',
          file_path: 'statics/media/628/2026-09-05/x.jpg',
          media_type: 'image',
        }),
      )
      .mockResolvedValueOnce(bytesRes('image/jpeg', 'real-bytes'))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('3EB0ABC', '628123456789@s.whatsapp.net')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://gowa.example.com/message/3EB0ABC/download?phone=628123456789%40s.whatsapp.net',
      { headers: { Authorization: AUTH } },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://gowa.example.com/statics/media/628/2026-09-05/x.jpg',
      { headers: { Authorization: AUTH } },
    )
    expect(result.mimeType).toBe('image/jpeg')
    expect(Buffer.from(result.base64, 'base64').toString()).toBe('real-bytes')
  })

  it('rebuilds the media URL from file_path against GOWA_BASE_URL when file_url is a loopback address', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          file_url: 'http://localhost:3000/statics/media/628/2026-09-05/x.jpg',
          file_path: 'statics/media/628/2026-09-05/x.jpg',
        }),
      )
      .mockResolvedValueOnce(bytesRes('image/png', 'png-bytes'))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('m1', '628@s.whatsapp.net')

    expect(fetchMock.mock.calls[1][0]).toBe('https://gowa.example.com/statics/media/628/2026-09-05/x.jpg')
    expect(result.mimeType).toBe('image/png')
  })

  it('falls back to media_type when the static file response carries no content-type', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ file_path: 'statics/media/x.jpg', media_type: 'image/webp' }))
      .mockResolvedValueOnce(bytesRes('', 'b')) as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('m1', '628@s.whatsapp.net')
    expect(result.mimeType).toBe('image/webp')
  })

  it('still handles a GOWA build that streams raw image bytes directly', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(bytesRes('image/jpeg; charset=binary', 'streamed')) as unknown as typeof fetch

    const result = await downloadWhatsAppMedia('m1', '628@s.whatsapp.net')
    expect(result.mimeType).toBe('image/jpeg')
    expect(Buffer.from(result.base64, 'base64').toString()).toBe('streamed')
  })

  it('throws with the actual status and body when the download request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"code":"VALIDATION_ERROR","message":"phone: cannot be blank."}',
    }) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('m1', '628@s.whatsapp.net')).rejects.toThrow('HTTP 400')
    await expect(downloadWhatsAppMedia('m1', '628@s.whatsapp.net')).rejects.toThrow('phone: cannot be blank')
  })

  it('throws when the second fetch (the static file) fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ file_path: 'statics/media/x.jpg' }))
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' }) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('m1', '628@s.whatsapp.net')).rejects.toThrow('HTTP 404')
  })

  it('throws when the JSON response has neither file_url nor file_path', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonRes({ media_type: 'image' })) as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('m1', '628@s.whatsapp.net')).rejects.toThrow('file_url maupun file_path')
  })

  it('throws when GOWA credentials are not configured, before ever calling fetch', async () => {
    delete process.env.GOWA_BASIC_AUTH_PASSWORD
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(downloadWhatsAppMedia('m1', '628@s.whatsapp.net')).rejects.toThrow('belum dikonfigurasi')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
