import { getLinksForUser } from './admin-data'

/**
 * A minimal, self-contained send path used by the cron endpoints (reminders, the
 * morning digest) to push a plain-text message — plus optional inline buttons on
 * Telegram — into a user's linked chat.
 *
 * This is deliberately separate from the webhook routes' own `sendMessage`, which
 * handles a much richer `BotReply` (HTML toggle, documents, message edits, id
 * return). Two send code paths coexisting is intentional.
 */

const SEND_TIMEOUT_MS = 10_000

export interface InlineButton {
  text: string
  /** Sent as Telegram `callback_data`; on WhatsApp it becomes a poll option. */
  token: string
}

type SendResult = { ok: boolean; error?: string }

function errString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function gowaAuthHeader(): string {
  return (
    'Basic ' +
    Buffer.from(
      `${process.env.GOWA_BASIC_AUTH_USER}:${process.env.GOWA_BASIC_AUTH_PASSWORD}`,
    ).toString('base64')
  )
}

/**
 * GOWA `/send/message`. Plain text only — inline actions on WhatsApp go out as a
 * separate poll via `sendWhatsAppPoll` (see `sendToUser`).
 */
export async function sendWhatsApp(externalId: string, text: string): Promise<SendResult> {
  try {
    const res = await fetch(`${process.env.GOWA_BASE_URL}/send/message`, {
      method: 'POST',
      headers: { Authorization: gowaAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: externalId, message: text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    return res.ok ? { ok: true } : { ok: false, error: `whatsapp_http_${res.status}` }
  } catch (err) {
    return { ok: false, error: errString(err) }
  }
}

/**
 * GOWA `/send/poll` — a single-answer poll used as WhatsApp's stand-in for inline
 * buttons. Returns the created poll's `message_id` so the caller can stash the
 * option→token map (see `poll-map.ts`); `null` on any failure, and the caller
 * falls back to a plain-text send.
 */
export async function sendWhatsAppPoll(
  externalId: string,
  question: string,
  options: string[],
): Promise<{ ok: boolean; pollId?: string; error?: string }> {
  try {
    const res = await fetch(`${process.env.GOWA_BASE_URL}/send/poll`, {
      method: 'POST',
      headers: { Authorization: gowaAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: externalId, question, options, max_answer: 1 }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `whatsapp_http_${res.status}` }
    const body = (await res.json().catch(() => null)) as
      | { results?: { message_id?: string } }
      | null
    return { ok: true, pollId: body?.results?.message_id }
  } catch (err) {
    return { ok: false, error: errString(err) }
  }
}

/** Telegram `sendMessage`. Buttons render as a single inline-keyboard row. */
export async function sendTelegram(
  externalId: string,
  text: string,
  opts?: { buttons?: InlineButton[] },
): Promise<SendResult> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: externalId,
          text,
          parse_mode: 'HTML',
          ...(opts?.buttons?.length
            ? {
                reply_markup: {
                  inline_keyboard: [
                    opts.buttons.map((b) => ({ text: b.text, callback_data: b.token })),
                  ],
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    )

    let body: { ok?: boolean } | null = null
    try {
      body = (await res.json()) as { ok?: boolean }
    } catch {
      body = null
    }

    const ok = res.ok && body?.ok !== false
    return ok ? { ok: true } : { ok: false, error: `telegram_http_${res.status}` }
  } catch (err) {
    return { ok: false, error: errString(err) }
  }
}

/**
 * Resolve a user's linked platform(s) and send to each. `BotPrefs` has no
 * preferred-platform field, so this always fans out to every link.
 */
export async function sendToUser(
  userId: string,
  text: string,
  opts?: {
    buttons?: InlineButton[]
    /** Called once a WhatsApp poll is created, with its message id — used to
     *  persist the option→token map so a vote can be resolved to a command. */
    onPollSent?: (pollId: string, buttons: InlineButton[]) => Promise<void>
  },
): Promise<{ ok: boolean; sent: number; error?: string }> {
  const links = await getLinksForUser(userId)
  if (links.length === 0) return { ok: false, sent: 0, error: 'not_linked' }

  const results = await Promise.all(
    links.map(async (link) => {
      if (link.platform === 'whatsapp') {
        // The copy is authored for Telegram's `parse_mode: 'HTML'`; WhatsApp has no HTML,
        // so the tags would show up literally. Strip them rather than translate — there is
        // no rich WA markup mapping here and the plain text reads fine.
        // ponytail: regex strip, not a parser; the copy only ever emits <b>/<i>/<code>.
        const plain = text.replace(/<\/?[a-z][^>]*>/gi, '')
        const textRes = await sendWhatsApp(link.externalId, plain)

        // Buttons → a native poll. GOWA has no inline-button message type, but a
        // single-answer poll works end to end (vote comes back as a webhook).
        // The label→token map is stashed by the caller once it has `pollId`.
        if (opts?.buttons?.length) {
          const poll = await sendWhatsAppPoll(
            link.externalId,
            'Pilih tindakan:',
            opts.buttons.map((b) => b.text),
          )
          if (poll.ok && poll.pollId && opts.onPollSent) {
            await opts.onPollSent(poll.pollId, opts.buttons)
          }
        }
        return textRes
      }
      return sendTelegram(link.externalId, text, opts)
    }),
  )

  const sent = results.filter((r) => r.ok).length
  return { ok: sent > 0, sent, ...(sent === 0 ? { error: 'send_failed' } : {}) }
}
