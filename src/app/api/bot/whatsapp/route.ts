import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { handleIncoming } from '@/shared/bot/core'
import { downloadWhatsAppMedia } from '@/shared/bot/media-whatsapp'
import type { BotIncoming } from '@/shared/bot/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface WhatsAppMessage {
  from: string
  type: string
  text?: { body: string }
  image?: { id: string; caption?: string }
}

interface WhatsAppWebhookBody {
  entry?: {
    changes?: {
      value?: {
        messages?: WhatsAppMessage[]
      }
    }[]
  }[]
}

/**
 * Meta's verification handshake, required once to register the webhook URL in the
 * developer console. Echoes `hub.challenge` back only if `hub.verify_token` matches.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  const verifyToken = process.env.META_VERIFY_TOKEN

  if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET
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

async function sendMessage(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return
  try {
    await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    })
  } catch (error) {
    console.error('whatsapp sendMessage error:', error)
  }
}

async function processMessage(message: WhatsAppMessage): Promise<void> {
  try {
    let incoming: BotIncoming | null = null

    if (message.type === 'image' && message.image?.id) {
      const image = await downloadWhatsAppMedia(message.image.id)
      incoming = {
        platform: 'whatsapp',
        externalId: message.from,
        kind: 'image',
        imageBase64: image.base64,
        mimeType: image.mimeType,
        caption: message.image.caption,
      }
    } else if (message.type === 'text' && message.text?.body) {
      incoming = { platform: 'whatsapp', externalId: message.from, kind: 'text', text: message.text.body }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      await sendMessage(message.from, reply.text)
    }
  } catch (error) {
    console.error('whatsapp webhook message error:', error)
    await sendMessage(message.from, 'Ada masalah di sisi kami — coba lagi sebentar lagi.')
  }
}

/**
 * WhatsApp webhook. Signature is verified over the exact raw bytes Meta signed —
 * `request.text()`, never `.json()` then re-stringified, which would produce
 * different bytes and never match. `value.statuses` (sent/delivered/read receipts)
 * has no `messages` array and is silently skipped, same as any other update with no
 * user message in it. Always responds 200 once past auth, for the same retry reason
 * as the Telegram adapter.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: WhatsAppWebhookBody
  try {
    body = JSON.parse(rawBody) as WhatsAppWebhookBody
  } catch {
    return NextResponse.json({ ok: true })
  }

  const messages = (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) => change.value?.messages ?? []),
  )

  for (const message of messages) {
    await processMessage(message)
  }

  return NextResponse.json({ ok: true })
}
