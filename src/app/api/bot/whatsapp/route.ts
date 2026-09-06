import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { claimInboundMessage } from '@/shared/bot/admin-data'
import { handleIncoming } from '@/shared/bot/core'
import { renderForWhatsApp } from '@/shared/bot/format-wa'
import { downloadWhatsAppMedia } from '@/shared/bot/media-whatsapp'
import { replies } from '@/shared/bot/replies'
import type { BotIncoming, BotReply } from '@/shared/bot/types'

export const runtime = 'nodejs'
// The 200 is returned in well under a second (see POST); this budget is for the
// `waitUntil` pipeline that keeps running after it — Gemini vision on a receipt photo
// is the long pole.
export const maxDuration = 180

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

function gowaAuth(): { baseUrl: string; authHeader: string } | null {
  const baseUrl = process.env.GOWA_BASE_URL
  const user = process.env.GOWA_BASIC_AUTH_USER
  const password = process.env.GOWA_BASIC_AUTH_PASSWORD
  if (!baseUrl || !user || !password) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authHeader: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
  }
}

/**
 * Fire-and-forget acknowledgements. None of these are worth failing a transaction
 * over — a dropped typing indicator is invisible, a dropped reply is not — so every
 * one of them swallows its own error.
 */
async function gowaPost(path: string, body: Record<string, unknown>): Promise<void> {
  const auth = gowaAuth()
  if (!auth) return
  try {
    await fetch(`${auth.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    console.error(`whatsapp (gowa) ${path} error:`, error)
  }
}

/** WhatsApp shows this for a few seconds; GOWA needs an explicit stop. */
function setTyping(chatId: string, action: 'start' | 'stop'): Promise<void> {
  return gowaPost('/send/chat-presence', { phone: chatId, action })
}

/** 👀 on arrival, ✅ when the reply is out — the cheapest possible "I heard you". */
function react(messageId: string, chatId: string, emoji: string): Promise<void> {
  return gowaPost(`/message/${encodeURIComponent(messageId)}/reaction`, { phone: chatId, emoji })
}

/** Returns the sent message's id so a placeholder can later be edited in place. */
async function sendMessage(chatId: string, reply: BotReply): Promise<string | null> {
  const auth = gowaAuth()
  if (!auth) return null
  try {
    const res = await fetch(`${auth.baseUrl}/send/message`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chatId, message: renderForWhatsApp(reply) }),
    })
    const body = (await res.json()) as { results?: { message_id?: string } }
    return body.results?.message_id ?? null
  } catch (error) {
    console.error('whatsapp (gowa) sendMessage error:', error)
    return null
  }
}

/** WhatsApp allows editing your own message for about 15 minutes — far longer than any
 *  receipt read takes. Falls back to a fresh message if the edit is refused, so a stale
 *  placeholder can never be the last thing the user sees. */
async function editMessage(chatId: string, messageId: string, reply: BotReply): Promise<void> {
  const auth = gowaAuth()
  if (!auth) return
  try {
    const res = await fetch(`${auth.baseUrl}/message/${encodeURIComponent(messageId)}/update`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chatId, message: renderForWhatsApp(reply) }),
    })
    if (!res.ok) await sendMessage(chatId, reply)
  } catch (error) {
    console.error('whatsapp (gowa) editMessage error:', error)
    await sendMessage(chatId, reply)
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

  await react(payload.id, payload.chat_id, '👀')
  await setTyping(payload.chat_id, 'start')

  let placeholderId: string | null = null

  try {
    let incoming: BotIncoming | null = null

    if (payload.image) {
      // Only photos are slow enough to need a placeholder; a text message is usually
      // answered from the local layer before one would even render.
      placeholderId = await sendMessage(payload.chat_id, replies.receiptReceived())
      // `chat_id` (full JID) is required by GOWA's download endpoint as `phone` — it
      // rejects a blank one with HTTP 400 and cross-checks it against the message's
      // own chat.
      const image = await downloadWhatsAppMedia(payload.id, payload.chat_id)
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
      if (placeholderId) await editMessage(payload.chat_id, placeholderId, reply)
      else await sendMessage(payload.chat_id, reply)
      await react(payload.id, payload.chat_id, '✅')
    }
  } catch (error) {
    console.error('whatsapp (gowa) webhook message error:', error)
    await sendMessage(payload.chat_id, { text: 'Ada masalah di sisi kami — coba lagi sebentar lagi.' })
  } finally {
    await setTyping(payload.chat_id, 'stop')
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
 *
 * The 200 is returned immediately and `processMessage` runs in `waitUntil` AFTER the
 * response: GOWA's webhook client times out at a hardcoded 10s and then retries 5×,
 * and the pipeline (GOWA media fetch → Gemini vision → Drive upload → reply) does not
 * fit in 10s. Acking first stops the retry storm; `claimInboundMessage` makes the
 * already-queued retries no-ops. Failures still reach the user as a chat message,
 * never as an HTTP status.
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

  const payload = body.payload
  if (body.event === 'message' && payload && !payload.is_from_me) {
    let shouldProcess = true
    try {
      // false => another delivery of this same message id already owns it (GOWA
      // retries a slow webhook up to 5×). A thrown error here (Firestore blip) is
      // fail-open: better a rare duplicate than a dropped message with no reply.
      shouldProcess = await claimInboundMessage('whatsapp', payload.id)
    } catch (error) {
      console.error('whatsapp (gowa) claimInboundMessage error (processing anyway):', error)
    }
    if (shouldProcess) waitUntil(processMessage(payload))
  }

  return NextResponse.json({ ok: true })
}
