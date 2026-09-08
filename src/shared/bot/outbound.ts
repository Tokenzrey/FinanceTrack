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
  /** Sent as Telegram `callback_data`; on WhatsApp it becomes a "Balas: <token>" line. */
  token: string
}

type SendResult = { ok: boolean; error?: string }

function errString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * GOWA `/send/message`. No inline-button support on this endpoint — any `buttons`
 * are the caller's problem (see `sendToUser`, which folds them into the text).
 */
export async function sendWhatsApp(externalId: string, text: string): Promise<SendResult> {
  try {
    const authHeader =
      'Basic ' +
      Buffer.from(
        `${process.env.GOWA_BASIC_AUTH_USER}:${process.env.GOWA_BASIC_AUTH_PASSWORD}`,
      ).toString('base64')

    const res = await fetch(`${process.env.GOWA_BASE_URL}/send/message`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: externalId, message: text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    return res.ok ? { ok: true } : { ok: false, error: `whatsapp_http_${res.status}` }
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
  opts?: { buttons?: InlineButton[] },
): Promise<{ ok: boolean; sent: number; error?: string }> {
  const links = await getLinksForUser(userId)
  if (links.length === 0) return { ok: false, sent: 0, error: 'not_linked' }

  const results = await Promise.all(
    links.map((link) => {
      if (link.platform === 'whatsapp') {
        // The copy is authored for Telegram's `parse_mode: 'HTML'`; WhatsApp has no HTML,
        // so the tags would show up literally. Strip them rather than translate — there is
        // no rich WA markup mapping here and the plain text reads fine.
        // ponytail: regex strip, not a parser; the copy only ever emits <b>/<i>/<code>.
        const plain = text.replace(/<\/?[a-z][^>]*>/gi, '')
        // No inline buttons on GOWA's /send/message — the tokens go out as bare reply
        // lines the `pr:` handler in core.ts matches verbatim.
        const waText = opts?.buttons?.length
          ? plain + '\n\nBalas salah satu:\n' + opts.buttons.map((b) => b.token).join('\n')
          : plain
        return sendWhatsApp(link.externalId, waText)
      }
      return sendTelegram(link.externalId, text, opts)
    }),
  )

  const sent = results.filter((r) => r.ok).length
  return { ok: sent > 0, sent, ...(sent === 0 ? { error: 'send_failed' } : {}) }
}
