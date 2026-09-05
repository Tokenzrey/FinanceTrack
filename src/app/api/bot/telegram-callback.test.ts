import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Scope: how the Telegram route handles `update.callback_query` (inline-keyboard
// taps) specifically — text-message handling and auth are covered elsewhere
// (webhook-auth.test.ts, core.test.ts). `core.ts` is mocked so these tests exercise
// only the route's own callback-query wiring.

const handleIncoming = vi.fn()
vi.mock('@/shared/bot/core', () => ({
  handleIncoming: (...args: unknown[]) => handleIncoming(...args),
}))

const claimInboundMessage = vi.fn()
vi.mock('@/shared/bot/admin-data', () => ({
  claimInboundMessage: (...args: unknown[]) => claimInboundMessage(...args),
}))

// The route hands processing to `waitUntil` and returns 200 before it finishes.
const { waitUntilPromises } = vi.hoisted(() => ({ waitUntilPromises: [] as Promise<unknown>[] }))
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromises.push(Promise.resolve(p))
  },
}))
const flush = () => Promise.all(waitUntilPromises.splice(0))

const { POST } = await import('./telegram/route')

const originalEnv = { ...process.env }
const url = 'https://example.com/api/bot/telegram'

function req(update: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'tg-secret' },
    body: JSON.stringify(update),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  waitUntilPromises.length = 0
  handleIncoming.mockResolvedValue({ text: 'ok' })
  claimInboundMessage.mockResolvedValue(true)
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
  process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret'
  process.env.TELEGRAM_BOT_TOKEN = 'tg-token'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

function calledMethods(): string[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[0] as string).split('/').pop() ?? '')
}

describe('Telegram webhook — callback_query (inline keyboard taps)', () => {
  it('treats the tapped button\'s data exactly like a typed message', async () => {
    const res = await POST(
      req({
        update_id: 1,
        callback_query: {
          id: 'cbq-1',
          data: '1',
          message: { chat: { id: 42 }, message_id: 99 },
        },
      }),
    )
    await flush()
    expect(res.status).toBe(200)
    expect(handleIncoming).toHaveBeenCalledWith({ platform: 'telegram', externalId: '42', kind: 'text', text: '1' })
  })

  it('answers the callback query and edits the original message, removing its keyboard', async () => {
    await POST(
      req({ update_id: 2, callback_query: { id: 'cbq-1', data: 'batal', message: { chat: { id: 42 }, message_id: 99 } } }),
    )
    await flush()
    const methods = calledMethods()
    expect(methods).toContain('answerCallbackQuery')
    expect(methods).toContain('editMessageText')
    expect(methods).not.toContain('sendMessage') // a callback tap edits the existing message, never sends a new one
  })

  it('still answers the callback query even when handleIncoming throws, so the button never spins forever', async () => {
    handleIncoming.mockRejectedValue(new Error('boom'))
    const res = await POST(
      req({ update_id: 3, callback_query: { id: 'cbq-1', data: '1', message: { chat: { id: 42 }, message_id: 99 } } }),
    )
    await flush()
    expect(res.status).toBe(200)
    expect(calledMethods()).toContain('answerCallbackQuery')
  })

  it('answers the callback query even with no message attached (an old/inaccessible message)', async () => {
    const res = await POST(req({ update_id: 4, callback_query: { id: 'cbq-1', data: '1' } }))
    await flush()
    expect(res.status).toBe(200)
    expect(calledMethods()).toEqual(['answerCallbackQuery'])
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('still answers a redelivered callback, but does NOT run its action twice', async () => {
    claimInboundMessage.mockResolvedValue(false) // update_id already claimed by the first delivery

    await POST(
      req({ update_id: 5, callback_query: { id: 'cbq-1', data: '1', message: { chat: { id: 42 }, message_id: 99 } } }),
    )
    await flush()

    expect(claimInboundMessage).toHaveBeenCalledWith('telegram', 'cb_5')
    expect(calledMethods()).toEqual(['answerCallbackQuery']) // answered, but no editMessageText / handleIncoming
    expect(handleIncoming).not.toHaveBeenCalled()
  })
})

describe('Telegram webhook — message de-dup', () => {
  it('skips a redelivered message update (same update_id) entirely', async () => {
    claimInboundMessage.mockResolvedValue(false)

    await POST(req({ update_id: 10, message: { chat: { id: 7 }, text: 'ringkasan' } }))
    await flush()

    expect(claimInboundMessage).toHaveBeenCalledWith('telegram', 'msg_10')
    expect(handleIncoming).not.toHaveBeenCalled()
  })

  it('processes a message even if the de-dup claim throws (fail-open)', async () => {
    claimInboundMessage.mockRejectedValue(new Error('firestore blip'))

    await POST(req({ update_id: 11, message: { chat: { id: 7 }, text: 'ringkasan' } }))
    await flush()

    expect(handleIncoming).toHaveBeenCalledTimes(1)
  })
})
