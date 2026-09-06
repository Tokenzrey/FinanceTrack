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
