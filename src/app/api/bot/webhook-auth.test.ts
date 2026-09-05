import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Scope: webhook authentication only (secret/signature verification), per the
// implementation plan — business logic itself is covered by core.test.ts. `core.ts`
// is mocked here so a bad request never gets far enough to touch Firestore.

const handleIncoming = vi.fn()
vi.mock('@/shared/bot/core', () => ({
  handleIncoming: (...args: unknown[]) => handleIncoming(...args),
}))

const { POST: telegramPost } = await import('./telegram/route')
const { POST: whatsappPost } = await import('./whatsapp/route')

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  handleIncoming.mockResolvedValue({ text: 'ok' })
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch

  process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret'
  process.env.TELEGRAM_BOT_TOKEN = 'tg-token'
  process.env.WHATSAPP_WEBHOOK_SECRET = 'gowa-secret'
  process.env.GOWA_BASE_URL = 'https://gowa.example.com'
  process.env.GOWA_BASIC_AUTH_USER = 'admin'
  process.env.GOWA_BASIC_AUTH_PASSWORD = 'pw'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('Telegram webhook — X-Telegram-Bot-Api-Secret-Token', () => {
  const url = 'https://example.com/api/bot/telegram'
  const update = { message: { chat: { id: 123 }, text: 'ringkasan' } }

  function req(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(update),
    })
  }

  it('rejects a missing secret header with 403 and never processes the update', async () => {
    const res = await telegramPost(req())
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret header with 403', async () => {
    const res = await telegramPost(req({ 'x-telegram-bot-api-secret-token': 'wrong' }))
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('accepts the correct secret header with 200 and processes the update', async () => {
    const res = await telegramPost(req({ 'x-telegram-bot-api-secret-token': 'tg-secret' }))
    expect(res.status).toBe(200)
    expect(handleIncoming).toHaveBeenCalledTimes(1)
  })
})

describe('WhatsApp webhook (GOWA) — X-Hub-Signature-256', () => {
  const url = 'https://example.com/api/bot/whatsapp'
  // The exact same string is used to compute the signature and as the request body —
  // this is the point of the raw-body check: no JSON.parse/stringify round-trip
  // between signing and sending.
  const rawBody = JSON.stringify({
    event: 'message',
    device_id: '628987654321@s.whatsapp.net',
    payload: {
      id: 'msg-1',
      chat_id: '628123456789@s.whatsapp.net',
      from: '628123456789@s.whatsapp.net',
      from_name: 'Budi',
      timestamp: '2026-09-01T10:00:00Z',
      is_from_me: false,
      body: 'ringkasan',
    },
  })

  function sign(payload: string): string {
    return `sha256=${createHmac('sha256', 'gowa-secret').update(payload, 'utf8').digest('hex')}`
  }

  function req(body: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    })
  }

  it('rejects a missing signature with 403', async () => {
    const res = await whatsappPost(req(rawBody))
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('rejects a well-formed but incorrect signature with 403', async () => {
    const res = await whatsappPost(req(rawBody, { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` }))
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('accepts a correctly signed payload with 200 and processes the message', async () => {
    const res = await whatsappPost(req(rawBody, { 'x-hub-signature-256': sign(rawBody) }))
    expect(res.status).toBe(200)
    expect(handleIncoming).toHaveBeenCalledTimes(1)
  })

  it('ignores a non-"message" event (e.g. message.ack) even with a valid signature', async () => {
    const ackBody = JSON.stringify({
      event: 'message.ack',
      device_id: '628987654321@s.whatsapp.net',
      payload: { id: 'msg-1', chat_id: '628123456789@s.whatsapp.net', from: '628123456789@s.whatsapp.net', timestamp: '2026-09-01T10:00:00Z', is_from_me: false, body: '' },
    })
    const res = await whatsappPost(req(ackBody, { 'x-hub-signature-256': sign(ackBody) }))
    expect(res.status).toBe(200)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('ignores an echo of the bot\'s own outbound message (is_from_me: true)', async () => {
    const selfBody = JSON.stringify({
      event: 'message',
      device_id: '628987654321@s.whatsapp.net',
      payload: {
        id: 'msg-2',
        chat_id: '628123456789@s.whatsapp.net',
        from: '628987654321@s.whatsapp.net',
        timestamp: '2026-09-01T10:00:01Z',
        is_from_me: true,
        body: 'balasan bot',
      },
    })
    const res = await whatsappPost(req(selfBody, { 'x-hub-signature-256': sign(selfBody) }))
    expect(res.status).toBe(200)
    expect(handleIncoming).not.toHaveBeenCalled()
  })
})
