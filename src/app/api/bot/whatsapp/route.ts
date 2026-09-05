import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { handleIncoming } from '@/shared/bot/core'
import { downloadWhatsAppMedia } from '@/shared/bot/media-whatsapp'
import type { BotIncoming, BotReply } from '@/shared/bot/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface GowaMessage {
  id: string
  chat_id: string
  from: string
  from_name?: string
  timestamp: string
  is_from_me: boolean
  body: string
  image?: { path?: string; url?: string; caption?: string } | string
}

interface GowaWebhookBody {
  event: string
  device_id: string
  payload?: GowaMessage
}

/**
 * GOWA (go-whatsapp-web-multidevice) — self-hosted WhatsApp bridge, not the WhatsApp
 * Cloud API. No handshake to serve: unlike Meta, GOWA doesn't require a `GET`
 * challenge/response before it will send webhooks (configured directly in its own
 * `src/.env`, see BOT_SETUP_CHECKLIST.md) — this route is `POST`-only.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader.replace(/^sha256=/, '')

  const expectedBuf = Buffer.from(expected, 'hex')
  const providedBuf = Buffer.from(provided, 'hex')
  // timingSafeEqual throws on mismatched lengths — a malformed/wrong-length header
  // is simply not equal, not a crash.
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

/**
 * WhatsApp has no HTML/inline-keyboard support, so a `BotReply` is downgraded here,
 * once, in the one place that actually sends via GOWA — `core.ts`/`replies.ts` stay
 * platform-agnostic.
 *
 * A keyboard whose every value is either a bare number or `"batal"` (the
 * category-confirm and goal-contribution flows) renders as a plain numbered list —
 * typing the number reproduces exactly what tapping the button would have sent, so
 * the underlying flow needs no WhatsApp-specific branch at all. A keyboard carrying
 * self-contained action tokens instead (`unlink:confirm`, `skip_recurring:<id>:<day>`)
 * has no typed equivalent a user could plausibly guess, so those stay Telegram-only —
 * the message says so rather than silently going nowhere.
 */
function renderForWhatsApp(reply: BotReply): string {
  let text = reply.text
    .replace(/<b>([\s\S]*?)<\/b>/g, '*$1*')
    .replace(/<i>([\s\S]*?)<\/i>/g, '_$1_')
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  if (reply.keyboard && reply.keyboard.length > 0) {
    const buttons = reply.keyboard.flat()
    const allTypeable = buttons.every((b) => /^\d+$/.test(b.value) || b.value === 'batal')

    if (allTypeable) {
      const lines = buttons.map((b) => `${b.value === 'batal' ? '"batal"' : `${b.value})`} ${b.label}`)
      text += `\n\n${lines.join('\n')}`
    } else {
      text += '\n\n(Aksi ini saat ini hanya bisa dikonfirmasi lewat Telegram, atau lewat Pengaturan di web.)'
    }
  }

  return text
}

async function sendMessage(chatId: string, reply: BotReply): Promise<void> {
  const baseUrl = process.env.GOWA_BASE_URL
  const user = process.env.GOWA_BASIC_AUTH_USER
  const password = process.env.GOWA_BASIC_AUTH_PASSWORD
  if (!baseUrl || !user || !password) return
  try {
    const authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
    await fetch(`${baseUrl}/send/message`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chatId, message: renderForWhatsApp(reply) }),
    })
  } catch (error) {
    console.error('whatsapp (gowa) sendMessage error:', error)
  }
}

/** `bot_links`/`externalId` stay plain digits (matching Telegram's convention) — the
 *  full JID (with `@s.whatsapp.net`/`@g.us`) is kept separately for replying, since
 *  that's the format GOWA's `phone` field expects. */
function stripJidSuffix(jid: string): string {
  return jid.replace(/@(s\.whatsapp\.net|g\.us)$/, '')
}

function imageCaption(image: GowaMessage['image']): string | undefined {
  return typeof image === 'object' ? image.caption : undefined
}

async function processMessage(payload: GowaMessage): Promise<void> {
  if (!payload.chat_id) return
  const externalId = stripJidSuffix(payload.chat_id)

  try {
    let incoming: BotIncoming | null = null

    if (payload.image) {
      const image = await downloadWhatsAppMedia(payload.id)
      incoming = {
        platform: 'whatsapp',
        externalId,
        kind: 'image',
        imageBase64: image.base64,
        mimeType: image.mimeType,
        caption: imageCaption(payload.image),
      }
    } else if (payload.body) {
      incoming = { platform: 'whatsapp', externalId, kind: 'text', text: payload.body }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      await sendMessage(payload.chat_id, reply)
    }
  } catch (error) {
    console.error('whatsapp (gowa) webhook message error:', error)
    await sendMessage(payload.chat_id, { text: 'Ada masalah di sisi kami — coba lagi sebentar lagi.' })
  }
}

/**
 * GOWA webhook. Signature is verified over the exact raw bytes GOWA signed —
 * `request.text()`, never `.json()` then re-stringified, which would produce
 * different bytes and never match. Only `event: "message"` is processed — GOWA also
 * forwards `message.ack`, reactions, receipts, etc. to the same URL if configured to
 * (see `WHATSAPP_WEBHOOK_EVENTS` in BOT_SETUP_CHECKLIST.md), and those are not user
 * messages. `payload.is_from_me` filters out echoes of the bot's own outbound sends —
 * GOWA reports those on the same webhook since they originate from the linked device.
 * Always responds 200 once past auth, for the same reason as the Telegram adapter:
 * failures are reported to the user as a chat message, never as an HTTP status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: GowaWebhookBody
  try {
    body = JSON.parse(rawBody) as GowaWebhookBody
  } catch {
    return NextResponse.json({ ok: true })
  }

  if (body.event === 'message' && body.payload && !body.payload.is_from_me) {
    await processMessage(body.payload)
  }

  return NextResponse.json({ ok: true })
}
