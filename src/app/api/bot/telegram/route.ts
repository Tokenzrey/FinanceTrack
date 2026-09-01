import { NextResponse, type NextRequest } from 'next/server'
import { handleIncoming } from '@/shared/bot/core'
import { downloadTelegramPhoto } from '@/shared/bot/media-telegram'
import type { BotIncoming } from '@/shared/bot/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
    caption?: string
    photo?: { file_id: string }[]
  }
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (error) {
    console.error('telegram sendMessage error:', error)
  }
}

/**
 * Telegram webhook. Always responds 200 regardless of what happened while processing
 * — any non-200 makes Telegram retry the same update repeatedly, so failures are
 * reported to the user as a chat message instead, never as an HTTP status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const provided = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = message.chat.id

  try {
    let incoming: BotIncoming | null = null

    if (message.photo && message.photo.length > 0) {
      // Telegram sends the same photo at multiple resolutions; the last entry is the
      // largest.
      const largest = message.photo[message.photo.length - 1]
      const image = await downloadTelegramPhoto(largest.file_id)
      incoming = {
        platform: 'telegram',
        externalId: String(chatId),
        kind: 'image',
        imageBase64: image.base64,
        mimeType: image.mimeType,
        caption: message.caption,
      }
    } else if (typeof message.text === 'string') {
      incoming = { platform: 'telegram', externalId: String(chatId), kind: 'text', text: message.text }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      await sendMessage(chatId, reply.text)
    }
  } catch (error) {
    console.error('telegram webhook error:', error)
    await sendMessage(chatId, 'Ada masalah di sisi kami — coba lagi sebentar lagi.')
  }

  return NextResponse.json({ ok: true })
}
