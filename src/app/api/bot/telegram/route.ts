import { NextResponse, type NextRequest } from 'next/server'
import { handleIncoming } from '@/shared/bot/core'
import { downloadTelegramPhoto } from '@/shared/bot/media-telegram'
import type { BotIncoming, BotReply } from '@/shared/bot/types'

export const runtime = 'nodejs'
export const maxDuration = 30

interface TelegramCallbackQuery {
  id: string
  data?: string
  message?: { chat: { id: number }; message_id: number }
}

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
    caption?: string
    photo?: { file_id: string }[]
  }
  callback_query?: TelegramCallbackQuery
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN
}

function toReplyMarkup(reply: BotReply): Record<string, unknown> | undefined {
  if (!reply.keyboard) return undefined
  return { inline_keyboard: reply.keyboard.map((row) => row.map((b) => ({ text: b.label, callback_data: b.value }))) }
}

async function callTelegram(method: string, payload: Record<string, unknown>): Promise<void> {
  const token = botToken()
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error(`telegram ${method} error:`, error)
  }
}

async function sendMessage(chatId: number, reply: BotReply): Promise<void> {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: reply.text,
    parse_mode: reply.html === false ? undefined : 'HTML',
    reply_markup: toReplyMarkup(reply),
  })
}

/** Replaces a tapped-button message with the result and removes its keyboard, so a
 *  stale button can never be tapped a second time. */
async function editMessage(chatId: number, messageId: number, reply: BotReply): Promise<void> {
  await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: reply.text,
    parse_mode: reply.html === false ? undefined : 'HTML',
    reply_markup: toReplyMarkup(reply) ?? {},
  })
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId })
}

async function handleTextOrPhotoMessage(message: NonNullable<TelegramUpdate['message']>): Promise<void> {
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
      await sendMessage(chatId, reply)
    }
  } catch (error) {
    console.error('telegram webhook error:', error)
    await sendMessage(chatId, { text: 'Ada masalah di sisi kami — coba lagi sebentar lagi.' })
  }
}

async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  // Answered first, before anything else can fail — otherwise the tapped button spins
  // forever on the user's screen even though the tap was received.
  await answerCallbackQuery(query.id)

  if (!query.message || typeof query.data !== 'string') return
  const chatId = query.message.chat.id

  try {
    const incoming: BotIncoming = {
      platform: 'telegram',
      externalId: String(chatId),
      kind: 'text',
      text: query.data,
    }
    const reply = await handleIncoming(incoming)
    await editMessage(chatId, query.message.message_id, reply)
  } catch (error) {
    console.error('telegram callback_query error:', error)
    await editMessage(chatId, query.message.message_id, { text: 'Ada masalah di sisi kami — coba lagi sebentar lagi.' })
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

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
  } else if (update.message) {
    await handleTextOrPhotoMessage(update.message)
  }

  return NextResponse.json({ ok: true })
}
