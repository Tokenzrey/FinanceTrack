import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Scope: how the GOWA webhook route normalizes a payload into `BotIncoming` and
// dispatches text vs. image — signature/event/is_from_me filtering is covered in
// webhook-auth.test.ts, `core.ts`'s own behavior in core.test.ts. Both `core.ts` and
// `media-whatsapp.ts` are mocked here so only the route's own wiring is exercised.

const handleIncoming = vi.fn()
vi.mock('@/shared/bot/core', () => ({
  handleIncoming: (...args: unknown[]) => handleIncoming(...args),
}))

const downloadWhatsAppMedia = vi.fn()
vi.mock('@/shared/bot/media-whatsapp', () => ({
  downloadWhatsAppMedia: (...args: unknown[]) => downloadWhatsAppMedia(...args),
}))

const claimInboundMessage = vi.fn()
vi.mock('@/shared/bot/admin-data', () => ({
  claimInboundMessage: (...args: unknown[]) => claimInboundMessage(...args),
}))

// The route hands the pipeline to `waitUntil` and returns 200 before it finishes.
// Collect those promises so each test can await the pipeline explicitly via `flush()`.
const { waitUntilPromises } = vi.hoisted(() => ({ waitUntilPromises: [] as Promise<unknown>[] }))
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromises.push(Promise.resolve(p))
  },
}))
const flush = () => Promise.all(waitUntilPromises.splice(0))

const { POST } = await import('./whatsapp/route')

const originalEnv = { ...process.env }
const url = 'https://example.com/api/bot/whatsapp'

function sign(payload: string): string {
  return `sha256=${createHmac('sha256', 'gowa-secret').update(payload, 'utf8').digest('hex')}`
}

function req(body: object): NextRequest {
  const raw = JSON.stringify(body)
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sign(raw) },
    body: raw,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  waitUntilPromises.length = 0
  handleIncoming.mockResolvedValue({ text: 'ok' })
  claimInboundMessage.mockResolvedValue(true)
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch

  process.env.WHATSAPP_WEBHOOK_SECRET = 'gowa-secret'
  process.env.GOWA_BASE_URL = 'https://gowatokenzrey.my.id'
  process.env.GOWA_BASIC_AUTH_USER = 'admin'
  process.env.GOWA_BASIC_AUTH_PASSWORD = 'pw'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('WhatsApp (GOWA) — message normalization', () => {
  it('strips the JID suffix for externalId, but replies using the full chat_id', async () => {
    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-1',
          chat_id: '628123456789@s.whatsapp.net',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: 'ringkasan',
        },
      }),
    )
    await flush()

    expect(handleIncoming).toHaveBeenCalledWith({
      platform: 'whatsapp',
      externalId: '628123456789',
      kind: 'text',
      text: 'ringkasan',
    })

    const [sendUrl, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sendUrl).toBe('https://gowatokenzrey.my.id/send/message')
    expect(JSON.parse(init.body).phone).toBe('628123456789@s.whatsapp.net') // full JID, not the stripped id
  })

  it('strips the group JID suffix (@g.us) the same way', async () => {
    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-2',
          chat_id: '120363012345678901@g.us',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: 'ringkasan',
        },
      }),
    )
    await flush()
    expect(handleIncoming).toHaveBeenCalledWith(expect.objectContaining({ externalId: '120363012345678901' }))
  })

  it('skips processing entirely when the message id was already claimed (GOWA retry / redelivery)', async () => {
    claimInboundMessage.mockResolvedValue(false)

    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-dup',
          chat_id: '628123456789@s.whatsapp.net',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: 'ringkasan',
        },
      }),
    )
    await flush()

    expect(claimInboundMessage).toHaveBeenCalledWith('whatsapp', 'msg-dup')
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('downloads media via the message id when the payload carries an image (object form, with caption)', async () => {
    downloadWhatsAppMedia.mockResolvedValue({ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' })

    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-3',
          chat_id: '628123456789@s.whatsapp.net',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: 'Check this out!',
          image: { path: 'statics/media/x.jpeg', caption: 'Check this out!' },
        },
      }),
    )
    await flush()

    expect(downloadWhatsAppMedia).toHaveBeenCalledWith('msg-3', '628123456789@s.whatsapp.net')
    expect(handleIncoming).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg', caption: 'Check this out!' }),
    )
  })

  it('handles the auto-download-without-caption quirk where `image` is a plain string, not an object', async () => {
    downloadWhatsAppMedia.mockResolvedValue({ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' })

    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-4',
          chat_id: '628123456789@s.whatsapp.net',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: '',
          image: 'statics/media/x.jpeg',
        },
      }),
    )
    await flush()

    expect(downloadWhatsAppMedia).toHaveBeenCalledWith('msg-4', '628123456789@s.whatsapp.net')
    const incoming = handleIncoming.mock.calls[0][0]
    expect(incoming.kind).toBe('image')
    expect(incoming.caption).toBeUndefined()
  })

  it('still responds 200 and reports a generic error to the user when the media download fails', async () => {
    downloadWhatsAppMedia.mockRejectedValue(new Error('network blip'))

    const res = await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-5',
          chat_id: '628123456789@s.whatsapp.net',
          from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z',
          is_from_me: false,
          body: '',
          image: 'statics/media/x.jpeg',
        },
      }),
    )
    await flush()

    expect(res.status).toBe(200)
    expect(handleIncoming).not.toHaveBeenCalled()
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body).message).toContain('masalah')
  })
})
