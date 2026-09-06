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
  | 'today_summary'
  | 'week_summary'
  | 'search'
  | 'undo'
  | 'stats'
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

export type BotTxType = 'expense' | 'income' | 'transfer'

/** Satu calon transaksi di dalam kartu tinjauan. */
export interface DraftLine {
  /** Nomor 1-based yang dilihat user; dihitung ulang setiap ada baris dihapus. */
  n: number
  type: BotTxType
  amount: number
  description: string | null
  categoryId: string | null
  categoryName: string | null
  /** ISO 8601 UTC. Ditampilkan dalam zona waktu user. */
  dateIso: string
  /** Kandidat kategori bernomor untuk perintah `kat <n> <k>`. Maks 4. */
  options: { categoryId: string; name: string }[]
  /** Hanya untuk baris asal struk. */
  quantity?: number | null
}

export interface DraftBatch {
  pendingKind: 'transaction_batch'
  source: 'text' | 'receipt'
  /** SELALU rincian per item. `mode` hanya mengubah commit & render (§2 D2). */
  lines: DraftLine[]
  /** `single` hanya bermakna untuk `source: 'receipt'`. */
  mode: 'single' | 'itemized'
  merchant: string | null
  /** Total yang dibaca model dari struk — dibandingkan dengan jumlah baris. */
  receiptTotal: number | null
  receipt?: { gDriveFileId: string; gDriveWebViewLink: string }
  /** Peringatan dari ekstraksi, ditampilkan di kartu. */
  warnings: string[]
}

/** Satu segmen transaksi hasil bacaan Gemini atas pesan teks. */
export interface ParsedLine {
  type: BotTxType
  description: string | null
  /** Potongan teks PERSIS dari pesan asli yang memuat nominal. Di-reparse oleh
   *  `parseAmount` — tidak pernah dipercaya sebagai angka (§2 D1). */
  amountText: string
  categoryCandidates: string[]
  dateOffset: number
  confidence: number
}

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
   *  WhatsApp has no equivalent — GOWA exposes no interactive message type at all. */
  keyboard?: BotKeyboardButton[][]
  /** Typed equivalents of `keyboard`, used ONLY by the WhatsApp adapter. When present
   *  it replaces the generic keyboard fallback entirely: a review card needs
   *  `kat 2 1`-style instructions, which no automatic numbering could produce. */
  whatsappHints?: string[]
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

/**
 * One deterministic edit against the review card, produced by `parseReviewCommand`
 * from either typed text or a Telegram `rv:*` callback token — a tap and a typed
 * command land on the same code path (GOWA exposes no buttons, so WhatsApp users
 * only ever type).
 */
export type ReviewCommand =
  | { kind: 'save' }
  | { kind: 'cancel' }
  | { kind: 'remove'; n: number }
  | { kind: 'set_category'; n: number; option: number }
  | { kind: 'set_amount'; n: number; amount: number }
  | { kind: 'set_description'; n: number; text: string }
  | { kind: 'set_date'; n: number; date: Date }
  | { kind: 'set_type'; n: number; type: BotTxType }
  | { kind: 'set_mode'; mode: 'single' | 'itemized' }
  /** Tombol "✏️ n" di Telegram: tampilkan menu edit untuk satu baris saja. */
  | { kind: 'focus'; n: number }
  | { kind: 'help' }
  | { kind: 'none' }

/** Verbosity dan ambang yang bisa diatur user lewat /mode dan /atur. */
export interface BotPrefs {
  /** `ringkas` memangkas blok insight, rincian per kategori, dan footer. */
  verbosity: 'ringkas' | 'detail'
  /** Ambang auto-accept jalur cepat teks. 100 = selalu tinjau dulu. */
  autoAcceptConfidence: number
  /** Paksa kartu tinjauan bahkan untuk satu transaksi yang sangat yakin. */
  alwaysReview: boolean
  /** Tampilkan baris insight di /ringkasan dan /saldo. */
  showInsights: boolean
  /** Id kategori yang selalu muncul paling atas di daftar pilihan. */
  quickCategories: string[]
}

export const DEFAULT_BOT_PREFS: BotPrefs = {
  verbosity: 'detail',
  autoAcceptConfidence: 60,
  alwaysReview: false,
  showInsights: true,
  quickCategories: [],
}
