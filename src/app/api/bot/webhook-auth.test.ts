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
const { GET: whatsappGet, POST: whatsappPost } = await import('./whatsapp/route')

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  handleIncoming.mockResolvedValue({ text: 'ok' })
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch

  process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret'
  process.env.TELEGRAM_BOT_TOKEN = 'tg-token'
  process.env.META_APP_SECRET = 'meta-secret'
  process.env.META_VERIFY_TOKEN = 'verify-me'
  process.env.WHATSAPP_ACCESS_TOKEN = 'wa-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-1'
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

describe('WhatsApp webhook — GET handshake', () => {
  const base = 'https://example.com/api/bot/whatsapp'

  it('echoes hub.challenge when hub.verify_token matches', async () => {
    const res = await whatsappGet(
      new NextRequest(`${base}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('12345')
  })

  it('rejects a wrong verify token with 403', async () => {
    const res = await whatsappGet(
      new NextRequest(`${base}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345`),
    )
    expect(res.status).toBe(403)
  })
})

describe('WhatsApp webhook — X-Hub-Signature-256', () => {
  const url = 'https://example.com/api/bot/whatsapp'
  // The exact same string is used to compute the signature and as the request body —
  // this is the point of the raw-body check: no JSON.parse/stringify round-trip
  // between signing and sending.
  const rawBody = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ from: '62812', type: 'text', text: { body: 'ringkasan' } }] } }] }],
  })

  function sign(payload: string): string {
    return `sha256=${createHmac('sha256', 'meta-secret').update(payload, 'utf8').digest('hex')}`
  }

  it('rejects a missing signature with 403', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    })
    const res = await whatsappPost(req)
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('rejects a well-formed but incorrect signature with 403', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
      body: rawBody,
    })
    const res = await whatsappPost(req)
    expect(res.status).toBe(403)
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('accepts a correctly signed payload with 200 and processes the message', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      body: rawBody,
    })
    const res = await whatsappPost(req)
    expect(res.status).toBe(200)
    expect(handleIncoming).toHaveBeenCalledTimes(1)
  })
})
