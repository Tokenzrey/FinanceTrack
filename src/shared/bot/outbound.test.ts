import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendTelegram, sendToUser } from './outbound'

vi.mock('./admin-data', () => ({
  getLinksForUser: vi.fn(),
  getBotPrefs: vi.fn(async () => ({})),
}))

const { getLinksForUser } = await import('./admin-data')
const mockedLinks = vi.mocked(getLinksForUser)

function okJson(payload: unknown = { ok: true }) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GOWA_BASE_URL = 'https://gowa.test'
  process.env.GOWA_BASIC_AUTH_USER = 'u'
  process.env.GOWA_BASIC_AUTH_PASSWORD = 'p'
  process.env.TELEGRAM_BOT_TOKEN = 'TOKEN'
})

describe('sendToUser', () => {
  it('returns not_linked when the user has no bot link, without any fetch', async () => {
    mockedLinks.mockResolvedValue([])
    const fetchMock = vi.spyOn(global, 'fetch')

    const r = await sendToUser('nobody', 'hai')

    expect(r).toEqual({ ok: false, sent: 0, error: 'not_linked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to Telegram sendMessage for a telegram-linked user', async () => {
    mockedLinks.mockResolvedValue([{ platform: 'telegram', externalId: '555' }])
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(okJson())

    const r = await sendToUser('linked', 'halo')

    expect(r).toEqual({ ok: true, sent: 1 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends a poll for buttons on WhatsApp and hands the poll id to onPollSent', async () => {
    mockedLinks.mockResolvedValue([{ platform: 'whatsapp', externalId: '628123' }])
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/send/poll')) {
        return okJson({ results: { message_id: 'poll-xyz' } })
      }
      return okJson()
    })
    const onPollSent = vi.fn().mockResolvedValue(undefined)

    const buttons = [
      { text: 'Sudah bayar', token: 'paid_1' },
      { text: 'Nanti', token: 'snooze_1' },
    ]
    const r = await sendToUser('linked', 'Ada tagihan jatuh tempo', { buttons, onPollSent })

    expect(r).toEqual({ ok: true, sent: 1 })

    // Plain text goes out with no token lines appended…
    const textCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/send/message'))!
    const textBody = JSON.parse((textCall[1] as RequestInit).body as string)
    expect(textBody.message).toBe('Ada tagihan jatuh tempo')

    // …and a single-answer poll carries the button labels.
    const pollCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/send/poll'))!
    const pollBody = JSON.parse((pollCall[1] as RequestInit).body as string)
    expect(pollBody.phone).toBe('628123')
    expect(pollBody.options).toEqual(['Sudah bayar', 'Nanti'])
    expect(pollBody.max_answer).toBe(1)

    expect(onPollSent).toHaveBeenCalledWith('poll-xyz', buttons)
  })

  it('strips HTML tags from the WhatsApp message (the copy is authored for Telegram)', async () => {
    mockedLinks.mockResolvedValue([{ platform: 'whatsapp', externalId: '628123' }])
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(okJson())

    await sendToUser('linked', '⏰ <i>Pengingat</i>\n\n<b>minum obat</b>')

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.message).toBe('⏰ Pengingat\n\nminum obat')
  })

  it('returns send_failed when the only send gets a failed HTTP response', async () => {
    mockedLinks.mockResolvedValue([{ platform: 'telegram', externalId: '555' }])
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }))

    const r = await sendToUser('linked', 'halo')

    expect(r).toEqual({ ok: false, sent: 0, error: 'send_failed' })
  })
})

describe('sendTelegram', () => {
  it('puts buttons into reply_markup.inline_keyboard with callback_data = token', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(okJson())

    const r = await sendTelegram('555', 'pilih', {
      buttons: [{ text: 'Ya', token: 'yes_1' }],
    })

    expect(r.ok).toBe(true)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Ya', callback_data: 'yes_1' })
  })

  it('never throws on a network error, resolves { ok: false }', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'))
    const r = await sendTelegram('555', 'x')
    expect(r.ok).toBe(false)
  })
})
