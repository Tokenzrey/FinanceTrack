import { NextResponse, type NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { claimInboundMessage } from '@/shared/bot/admin-data'
import { handleIncoming } from '@/shared/bot/core'
import { downloadTelegramPhoto } from '@/shared/bot/media-telegram'
import type { BotIncoming, BotReply } from '@/shared/bot/types'

export const runtime = 'nodejs'
// The 200 is returned immediately; this budget is for the `waitUntil` pipeline that
// keeps running after it — Gemini vision on a receipt photo is the long pole. Telegram
// retries an update whose webhook call it considers failed (slow / non-2xx), so the
// same fast-ack + de-dup pattern as the GOWA route applies here.
export const maxDuration = 180

interface TelegramCallbackQuery {
  id: string
  data?: string
  message?: { chat: { id: number }; message_id: number }
}

interface TelegramUpdate {
  /** Monotonic per-update id Telegram assigns; the de-dup key for a redelivered update. */
  update_id?: number
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

/** false => this update was already handled by an earlier delivery; skip. A thrown
 *  error (Firestore blip) is fail-open: a rare duplicate beats a dropped message. */
async function claimUpdate(kind: 'msg' | 'cb', updateId: number | undefined): Promise<boolean> {
  if (updateId == null) return true
  try {
    return await claimInboundMessage('telegram', `${kind}_${updateId}`)
  } catch (error) {
    console.error('telegram claimInboundMessage error (processing anyway):', error)
    return true
  }
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

async function handleCallbackQuery(query: TelegramCallbackQuery, updateId: number | undefined): Promise<void> {
  // Answered first, before anything else can fail — otherwise the tapped button spins
  // forever on the user's screen even though the tap was received. Cheap and safe to
  // repeat on a Telegram redelivery, so it runs before the de-dup gate.
  await answerCallbackQuery(query.id)

  if (!query.message || typeof query.data !== 'string') return
  // A redelivered callback update must not run the action (goal contribution, category
  // pick, "skip") twice.
  if (!(await claimUpdate('cb', updateId))) return

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
 *
 * Processing runs in `waitUntil` AFTER the 200: a receipt photo goes through Gemini
 * vision + a Drive upload, well past the few seconds Telegram waits before treating
 * the delivery as failed and retrying it. `claimInboundMessage` on `update_id` makes
 * any retry Telegram still sends a no-op instead of a second transaction / reply.
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
    waitUntil(handleCallbackQuery(update.callback_query, update.update_id))
  } else if (update.message) {
    const message = update.message
    if (await claimUpdate('msg', update.update_id)) {
      waitUntil(handleTextOrPhotoMessage(message))
    }
  }

  return NextResponse.json({ ok: true })
}
