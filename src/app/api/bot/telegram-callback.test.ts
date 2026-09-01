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
  handleIncoming.mockResolvedValue({ text: 'ok' })
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
        callback_query: {
          id: 'cbq-1',
          data: '1',
          message: { chat: { id: 42 }, message_id: 99 },
        },
      }),
    )
    expect(res.status).toBe(200)
    expect(handleIncoming).toHaveBeenCalledWith({ platform: 'telegram', externalId: '42', kind: 'text', text: '1' })
  })

  it('answers the callback query and edits the original message, removing its keyboard', async () => {
    await POST(
      req({ callback_query: { id: 'cbq-1', data: 'batal', message: { chat: { id: 42 }, message_id: 99 } } }),
    )
    const methods = calledMethods()
    expect(methods).toContain('answerCallbackQuery')
    expect(methods).toContain('editMessageText')
    expect(methods).not.toContain('sendMessage') // a callback tap edits the existing message, never sends a new one
  })

  it('still answers the callback query even when handleIncoming throws, so the button never spins forever', async () => {
    handleIncoming.mockRejectedValue(new Error('boom'))
    const res = await POST(
      req({ callback_query: { id: 'cbq-1', data: '1', message: { chat: { id: 42 }, message_id: 99 } } }),
    )
    expect(res.status).toBe(200)
    expect(calledMethods()).toContain('answerCallbackQuery')
  })

  it('answers the callback query even with no message attached (an old/inaccessible message)', async () => {
    const res = await POST(req({ callback_query: { id: 'cbq-1', data: '1' } }))
    expect(res.status).toBe(200)
    expect(calledMethods()).toEqual(['answerCallbackQuery'])
    expect(handleIncoming).not.toHaveBeenCalled()
  })
})
