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
