export type BotPlatform = 'telegram' | 'whatsapp'

export type BotIntent =
  | 'add_expense'
  | 'add_income'
  | 'get_summary'
  | 'get_balance'
  | 'list_categories'
  | 'get_recent'
  | 'get_year_summary'
  | 'list_goals'
  | 'contribute_goal'
  | 'net_worth'
  | 'list_recurring'
  | 'list_wishlist'
  | 'cancel_pending'
  | 'unlink'
  | 'help'
  | 'unknown'

export interface BotIncomingText {
  platform: BotPlatform
  externalId: string
  kind: 'text'
  text: string
}

export interface BotIncomingImage {
  platform: BotPlatform
  externalId: string
  kind: 'image'
  imageBase64: string
  mimeType: string
  /** Caption sent alongside the photo, if any. */
  caption?: string
}

/** What a webhook adapter hands to `core.ts` — platform-specific details (file ids,
 *  media ids, signatures) never cross this boundary. */
export type BotIncoming = BotIncomingText | BotIncomingImage

/** A single button in an inline keyboard row. `value` is what comes back as the
 *  incoming message when tapped — Telegram sends it as `callback_query.data`, treated
 *  identically to the user having typed it (see `core.ts`). */
export interface BotKeyboardButton {
  label: string
  value: string
}

export interface BotReply {
  text: string
  /** HTML-formatted (`<b>`, `<i>`, `<code>`, …) when true (the default every `replies.ts`
   *  function sets). WhatsApp has no HTML support — its adapter strips these tags to
   *  WhatsApp's own lite-markdown instead of sending them raw. */
  html?: boolean
  /** One row per array entry. Telegram renders this as a tappable inline keyboard.
   *  WhatsApp has no equivalent — its adapter falls back to a numbered text list built
   *  from the same buttons, exactly like the pre-keyboard text-only flow. */
  keyboard?: BotKeyboardButton[][]
}

/** What a platform media downloader hands back — already normalized, so `core.ts`
 *  never has to know which platform a `kind: 'image'` message came from. */
export interface DownloadedImage {
  base64: string
  mimeType: string
}

/**
 * Gemini's read on a text message's *meaning*. The amount is deliberately not part of
 * this shape — see `parse-amount.ts` for why nominal values are never trusted to the
 * model.
 */
export interface ParsedIntent {
  intent: BotIntent
  description: string | null
  /** Ranked candidate category ids, most likely first, up to 3. Empty when Gemini
   *  found no plausible match at all. */
  categoryCandidates: string[]
  /** Days to shift the transaction date by (0 = today, -1 = yesterday, ...). */
  dateOffset: number
  /** Confidence in `categoryCandidates[0]` specifically (0-100). */
  confidence: number
}
