export type BotPlatform = 'telegram' | 'whatsapp'

export type BotIntent =
  | 'add_expense'
  | 'add_income'
  | 'get_summary'
  | 'get_balance'
  | 'list_categories'
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

export interface BotReply {
  text: string
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
