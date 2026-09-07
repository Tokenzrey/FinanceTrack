## Task 1: Primitif Presentasi — Stempel Waktu & Renderer WhatsApp

Fondasi R2/R8/R9. Tidak mengubah perilaku alur manapun; hanya menyediakan primitif yang dipakai task berikutnya, plus memperbaiki bug decode entity (§2 D7).

**Files:**
- Modify: `src/shared/lib/format.ts` (tambah di akhir file)
- Test: `src/shared/lib/format.test.ts` (buat — belum ada)
- Create: `src/shared/bot/format-wa.ts`
- Test: `src/shared/bot/format-wa.test.ts`
- Modify: `src/shared/bot/types.ts` (tambah `whatsappHints` ke `BotReply`)
- Modify: `src/app/api/bot/whatsapp/route.ts:61-84` (hapus `renderForWhatsApp` lokal, impor dari `format-wa`)

**Interfaces:**
- Produces: `formatDateTime(date: Date, timeZone?: string): string`, `formatDayLong(date: Date, timeZone?: string): string`, `dayKeyInTz(date: Date, timeZone?: string): string`, `DEFAULT_TZ: string` dari `@/shared/lib/format`
- Produces: `htmlToWhatsApp(html: string): string`, `renderForWhatsApp(reply: BotReply): string` dari `@/shared/bot/format-wa`
- Produces: `BotReply.whatsappHints?: string[]`

- [ ] **Step 1: Tulis test yang gagal untuk formatter tanggal**

Buat `src/shared/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dayKeyInTz, formatDateTime, formatDayLong } from './format'

// 2026-09-06T07:32:00Z = 14.32 WIB pada hari Minggu.
const T = new Date(Date.UTC(2026, 8, 6, 7, 32, 0))

describe('formatDateTime', () => {
  it('renders the Jakarta wall clock with a WIB label, not the server UTC clock', () => {
    expect(formatDateTime(T)).toBe('Min, 6 Sep 2026 · 14.32 WIB')
  })

  it('honours a non-default Indonesian timezone', () => {
    expect(formatDateTime(T, 'Asia/Jayapura')).toBe('Min, 6 Sep 2026 · 16.32 WIT')
  })

  it('omits the label for a timezone outside Indonesia', () => {
    expect(formatDateTime(T, 'UTC')).toBe('Min, 6 Sep 2026 · 07.32')
  })
})

describe('formatDayLong', () => {
  it('spells the weekday and month out in full', () => {
    expect(formatDayLong(T)).toBe('Minggu, 6 September 2026')
  })
})

describe('dayKeyInTz', () => {
  it('rolls the day over at local midnight, not UTC midnight', () => {
    // 2026-09-06T17:30:00Z is already 2026-09-07 in Jakarta (UTC+7).
    const late = new Date(Date.UTC(2026, 8, 6, 17, 30, 0))
    expect(dayKeyInTz(late)).toBe('2026-09-07')
    expect(dayKeyInTz(late, 'UTC')).toBe('2026-09-06')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/lib/format.test.ts`
Expected: FAIL — `formatDateTime is not a function` (dan dua lainnya).

- [ ] **Step 3: Implementasi formatter di `format.ts`**

Tambahkan di akhir `src/shared/lib/format.ts`:

```ts
export const DEFAULT_TZ = 'Asia/Jakarta'

/** Label zona Indonesia. Zona lain tidak diberi label — lebih baik tanpa keterangan
 *  daripada salah menyebut "WIB" untuk jam yang bukan WIB. */
const TZ_LABELS: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

/**
 * "Min, 6 Sep 2026 · 14.32 WIB" — stempel yang dibawa setiap balasan transaksi bot.
 *
 * Wajib melalui `timeZone`: server Vercel berjalan di UTC, jadi `date.getHours()`
 * akan meleset 7 jam untuk user Indonesia. Pemisah jam titik (14.32) adalah konvensi
 * `id-ID` bawaan Intl, bukan salah ketik.
 */
export function formatDateTime(date: Date, timeZone: string = DEFAULT_TZ): string {
  const day = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  const label = TZ_LABELS[timeZone]
  return `${day} · ${time}${label ? ` ${label}` : ''}`
}

/** "Minggu, 6 September 2026" — untuk judul yang tidak butuh jam. */
export function formatDayLong(date: Date, timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** "yyyy-MM-dd" untuk `date` sebagaimana terlihat di `timeZone` — kunci yang harus
 *  dipakai filter "hari ini" supaya harinya berganti di tengah malam lokal. */
export function dayKeyInTz(date: Date, timeZone: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/lib/format.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Tulis test yang gagal untuk renderer WhatsApp**

Buat `src/shared/bot/format-wa.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { htmlToWhatsApp, renderForWhatsApp } from './format-wa'

describe('htmlToWhatsApp', () => {
  it('maps the inline tags replies.ts actually emits', () => {
    expect(htmlToWhatsApp('<b>tebal</b> <i>miring</i> <code>kode</code> <s>coret</s>')).toBe(
      '*tebal* _miring_ `kode` ~coret~',
    )
  })

  it('renders <u> as bold, since WhatsApp has no underline', () => {
    expect(htmlToWhatsApp('<u>garis</u>')).toBe('*garis*')
  })

  it('prefixes every line of a blockquote with "> "', () => {
    expect(htmlToWhatsApp('<blockquote>satu\ndua</blockquote>')).toBe('> satu\n> dua')
  })

  it('turns <pre> into a fenced block and leaves its body untouched', () => {
    expect(htmlToWhatsApp('<pre>a <b>bukan tebal</b></pre>')).toBe('```\na <b>bukan tebal</b>\n```')
  })

  it('flattens a link to "label (url)" — WhatsApp has no labelled links', () => {
    expect(htmlToWhatsApp('<a href="https://x.id">Buka</a>')).toBe('Buka (https://x.id)')
  })

  it('decodes &amp; LAST so an escaped entity survives intact', () => {
    // The old in-route renderer decoded &amp; first, turning "&amp;lt;" into "<".
    expect(htmlToWhatsApp('Makan &amp; Minum')).toBe('Makan & Minum')
    expect(htmlToWhatsApp('&amp;lt;tag&amp;gt;')).toBe('&lt;tag&gt;')
  })

  it('drops any tag it does not know rather than leaking markup', () => {
    expect(htmlToWhatsApp('<span class="tg-spoiler">rahasia</span>')).toBe('rahasia')
  })
})

describe('renderForWhatsApp', () => {
  it('appends whatsappHints verbatim and ignores the keyboard when hints are present', () => {
    const out = renderForWhatsApp({
      text: '<b>Tinjau</b>',
      html: true,
      keyboard: [[{ label: 'Simpan', value: 'rv:save' }]],
      whatsappHints: ['<b>ok</b> — simpan semua', '<b>batal</b> — batalkan'],
    })
    expect(out).toBe('*Tinjau*\n\n*ok* — simpan semua\n*batal* — batalkan')
  })

  it('renders a numeric keyboard as a typeable numbered list', () => {
    const out = renderForWhatsApp({
      text: 'Pilih:',
      html: true,
      keyboard: [[{ label: 'Makan', value: '1' }], [{ label: '❌ Batal', value: 'batal' }]],
    })
    expect(out).toBe('Pilih:\n\n*1*) Makan\n*batal* ❌ Batal')
  })

  it('tells the user an untypeable keyboard is Telegram-only', () => {
    const out = renderForWhatsApp({
      text: 'Putuskan?',
      html: true,
      keyboard: [[{ label: 'Ya', value: 'unlink:confirm' }]],
    })
    expect(out).toContain('hanya bisa dikonfirmasi lewat Telegram')
  })

  it('returns plain text untouched when there is no keyboard and no hints', () => {
    expect(renderForWhatsApp({ text: 'halo', html: true })).toBe('halo')
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/bot/format-wa.test.ts`
Expected: FAIL — `Failed to resolve import "./format-wa"`.

- [ ] **Step 7: Tambah `whatsappHints` ke `BotReply`**

Di `src/shared/bot/types.ts`, ganti interface `BotReply` menjadi:

```ts
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
```

- [ ] **Step 8: Implementasi `format-wa.ts`**

Buat `src/shared/bot/format-wa.ts`:

```ts
import type { BotReply } from './types'

/**
 * Renders a `BotReply` — authored once as Telegram-flavoured HTML in `replies.ts` —
 * into WhatsApp's own lite-markdown.
 *
 * WhatsApp supports `*bold*`, `_italic_`, `~strike~`, `` `inline` ``, fenced blocks,
 * `> quote`, and native `-`/`1.` lists. It supports no underline, no labelled links,
 * and — critically — no interactive buttons: GOWA exposes only text/media/poll/
 * location/contact endpoints, so every tappable action must also exist as something
 * the user can type (see `whatsappHints`).
 */

/** Ordered: each rule's replacement must not be re-matched by a later rule. */
const INLINE_RULES: [RegExp, string][] = [
  [/<b>([\s\S]*?)<\/b>/g, '*$1*'],
  [/<strong>([\s\S]*?)<\/strong>/g, '*$1*'],
  // WhatsApp has no underline; bold is the closest thing that still reads as emphasis.
  [/<u>([\s\S]*?)<\/u>/g, '*$1*'],
  [/<i>([\s\S]*?)<\/i>/g, '_$1_'],
  [/<em>([\s\S]*?)<\/em>/g, '_$1_'],
  [/<s>([\s\S]*?)<\/s>/g, '~$1~'],
  [/<del>([\s\S]*?)<\/del>/g, '~$1~'],
  [/<code>([\s\S]*?)<\/code>/g, '`$1`'],
  [/<a href="([^"]*)">([\s\S]*?)<\/a>/g, '$2 ($1)'],
]

const PRE_PLACEHOLDER = '\u0000PRE'

export function htmlToWhatsApp(html: string): string {
  // <pre> is pulled out first: its body is literal and must not be touched by the
  // inline rules or the tag stripper below.
  const blocks: string[] = []
  let text = html.replace(/<pre>([\s\S]*?)<\/pre>/g, (_match, body: string) => {
    blocks.push(body)
    return `${PRE_PLACEHOLDER}${blocks.length - 1}\u0000`
  })

  text = text.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, body: string) =>
    body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
  )

  for (const [pattern, replacement] of INLINE_RULES) {
    text = text.replace(pattern, replacement)
  }

  // Anything still tagged is markup replies.ts never meant WhatsApp to see.
  text = text.replace(/<[^>]+>/g, '')

  // `&amp;` LAST: decoding it first would turn an escaped "&amp;lt;" into a real "<".
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

  return text.replace(new RegExp(`${PRE_PLACEHOLDER}(\\d+)\u0000`, 'g'), (_match, index: string) =>
    ['```', blocks[Number(index)], '```'].join('\n'),
  )
}

export function renderForWhatsApp(reply: BotReply): string {
  const text = htmlToWhatsApp(reply.text)

  if (reply.whatsappHints && reply.whatsappHints.length > 0) {
    return `${text}\n\n${reply.whatsappHints.map(htmlToWhatsApp).join('\n')}`
  }

  if (!reply.keyboard || reply.keyboard.length === 0) return text

  const buttons = reply.keyboard.flat()
  // A keyboard whose every value is a bare number or "batal" renders as a numbered
  // list — typing the number reproduces exactly what tapping would have sent.
  const allTypeable = buttons.every((b) => /^\d+$/.test(b.value) || b.value === 'batal')
  if (!allTypeable) {
    return `${text}\n\n_Aksi ini hanya bisa dikonfirmasi lewat Telegram, atau lewat Pengaturan di web._`
  }

  const lines = buttons.map((b) =>
    b.value === 'batal' ? `*batal* ${htmlToWhatsApp(b.label)}` : `*${b.value}*) ${htmlToWhatsApp(b.label)}`,
  )
  return `${text}\n\n${lines.join('\n')}`
}
```

- [ ] **Step 9: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/bot/format-wa.test.ts`
Expected: PASS (11 test).

- [ ] **Step 10: Pakai renderer bersama di route WhatsApp**

Di `src/app/api/bot/whatsapp/route.ts`: hapus seluruh blok komentar + fungsi `renderForWhatsApp` lokal (baris ~53–89, dari `/**` yang diawali "WhatsApp has no HTML/inline-keyboard support" sampai penutup fungsi), lalu tambahkan impor:

```ts
import { renderForWhatsApp } from '@/shared/bot/format-wa'
```

`sendMessage` tidak berubah — tetap memanggil `renderForWhatsApp(reply)`.

- [ ] **Step 11: Jalankan seluruh test bot + typecheck**

Run: `npx vitest run src/shared/bot src/app/api/bot && npx tsc --noEmit`
Expected: PASS, exit 0. Test route WhatsApp yang ada tetap hijau karena perilaku render tidak berubah untuk balasan yang sudah ada.

- [ ] **Step 12: Commit**

```bash
git add src/shared/lib/format.ts src/shared/lib/format.test.ts src/shared/bot/format-wa.ts src/shared/bot/format-wa.test.ts src/shared/bot/types.ts src/app/api/bot/whatsapp/route.ts
git commit -m "feat(bot): timezone-aware datetime stamps and a tested WhatsApp renderer

Adds formatDateTime/formatDayLong/dayKeyInTz, all timezone-aware — the Vercel
runtime is UTC, so wall-clock stamps were 7 hours off for Indonesian users.

Moves renderForWhatsApp out of the route into src/shared/bot/format-wa.ts so it
can be unit-tested, expands tag coverage to <u>/<s>/<pre>/<blockquote>/<a>, and
fixes the entity decode order: &amp; was being decoded before &lt;, so an escaped
&amp;lt; collapsed into a real <."
```

---

