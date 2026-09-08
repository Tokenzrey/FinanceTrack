import { createElement, type ReactNode } from 'react'

/**
 * A deliberately limited markdown subset for task descriptions — NOT full
 * markdown. Safe from XSS by construction: this module only ever emits a fixed
 * whitelist of React elements (h3/h4/h5, ul/li, p, strong, em, code, a, a
 * disabled checkbox input) with a fixed set of props. It never builds HTML
 * strings and never touches `dangerouslySetInnerHTML`. Any text outside the
 * subset — including `<script>`, `<img onerror=…>`, bare `javascript:` URLs —
 * becomes a plain React text node, which React escapes.
 */

/** URL sanitizer — the ONLY protocols allowed through as an href. Everything
 *  else (javascript:, data:, vbscript:, relative-looking `foo:bar`, malformed)
 *  returns null. */
export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  // Belt-and-braces: reject dangerous schemes up front. Strip every char <= 0x20
  // (control chars + spaces/tabs/newlines) so `java\tscript:` style tricks that a
  // lax `new URL` might tolerate can't slip past the prefix check.
  let bare = ''
  for (const ch of trimmed) {
    if (ch.charCodeAt(0) > 0x20) bare += ch
  }
  bare = bare.toLowerCase()
  if (
    bare.startsWith('javascript:') ||
    bare.startsWith('data:') ||
    bare.startsWith('vbscript:')
  ) {
    return null
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // Relative / malformed — the subset requires absolute URLs.
    return null
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
    return url.href
  }
  return null
}

// ─── Inline ───────────────────────────────────────────────────────────────────

// One left-to-right scan. Precedence is encoded by alternation order:
// `code` first (its content is literal), then links, then bold, then italic.
// Italic uses `\*(?!\*)…` so it never swallows a `**bold**` marker.
const INLINE_RE =
  /(`[^`]+`)|(\[[^\]\n]*\]\([^)\n]*\))|(\*\*[^\n]+?\*\*)|(\*(?!\*)[^*\n]+?\*)/g

const LINK_RE = /^\[([^\]\n]*)\]\(([^)\n]*)\)$/

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  let i = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (m[1]) {
      // `code` — literal content, no further parsing.
      out.push(
        createElement(
          'code',
          { key, className: 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]' },
          token.slice(1, -1),
        ),
      )
    } else if (m[2]) {
      const lm = LINK_RE.exec(token)
      const href = lm ? safeUrl(lm[2]) : null
      if (lm && href) {
        out.push(
          createElement(
            'a',
            {
              key,
              href,
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              className: 'text-primary underline underline-offset-2',
            },
            lm[1],
          ),
        )
      } else {
        // Blocked/malformed URL → emit the literal source, never a bare <a>.
        out.push(token)
      }
    } else if (m[3]) {
      out.push(createElement('strong', { key }, token.slice(2, -2)))
    } else if (m[4]) {
      out.push(createElement('em', { key }, token.slice(1, -1)))
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// ─── Block ────────────────────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,3}) +(.*)$/
const CHECKBOX_RE = /^- \[([ xX])\] ?(.*)$/
const BULLET_RE = /^- (.*)$/

const HEADING_TAG = ['h3', 'h4', 'h5'] as const
const HEADING_CLASS = [
  'text-sm font-semibold',
  'text-sm font-medium',
  'text-xs font-semibold uppercase tracking-wide',
] as const

type Line =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'checkbox'; checked: boolean; text: string }
  | { kind: 'blank' }
  | { kind: 'para'; text: string }

function classify(line: string): Line {
  const h = HEADING_RE.exec(line)
  if (h) return { kind: 'heading', level: h[1].length, text: h[2] }
  const c = CHECKBOX_RE.exec(line)
  if (c) return { kind: 'checkbox', checked: c[1].toLowerCase() === 'x', text: c[2] }
  const b = BULLET_RE.exec(line)
  if (b) return { kind: 'bullet', text: b[1] }
  if (line.trim() === '') return { kind: 'blank' }
  return { kind: 'para', text: line }
}

/** Parse the limited markdown subset into whitelisted React elements.
 *  Everything outside the subset passes through as plain text (React-escaped). */
export function renderMarkdownLite(src: string): ReactNode {
  const lines = src.split('\n').map(classify)
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === 'blank') {
      i++
      continue
    }

    if (line.kind === 'heading') {
      const idx = Math.min(line.level, 3) - 1
      blocks.push(
        createElement(
          HEADING_TAG[idx],
          { key: key++, className: HEADING_CLASS[idx] },
          renderInline(line.text, `h${key}`),
        ),
      )
      i++
      continue
    }

    if (line.kind === 'bullet') {
      const items: ReactNode[] = []
      while (i < lines.length && lines[i].kind === 'bullet') {
        const li = lines[i] as Extract<Line, { kind: 'bullet' }>
        items.push(
          createElement('li', { key: items.length }, renderInline(li.text, `li${key}-${items.length}`)),
        )
        i++
      }
      blocks.push(
        createElement('ul', { key: key++, className: 'list-disc pl-5 space-y-0.5' }, items),
      )
      continue
    }

    if (line.kind === 'checkbox') {
      const items: ReactNode[] = []
      while (i < lines.length && lines[i].kind === 'checkbox') {
        const cb = lines[i] as Extract<Line, { kind: 'checkbox' }>
        items.push(
          createElement(
            'li',
            { key: items.length, className: 'flex items-start gap-2' },
            createElement('input', {
              type: 'checkbox',
              disabled: true,
              checked: cb.checked,
              readOnly: true,
              className: 'mt-1',
              'aria-hidden': true,
            }),
            createElement('span', null, renderInline(cb.text, `cb${key}-${items.length}`)),
          ),
        )
        i++
      }
      blocks.push(
        createElement('ul', { key: key++, className: 'list-none pl-0 space-y-0.5' }, items),
      )
      continue
    }

    // Consecutive plain lines → one <p> with <br> between (textarea-like).
    const paraLines: string[] = []
    while (i < lines.length && lines[i].kind === 'para') {
      paraLines.push((lines[i] as Extract<Line, { kind: 'para' }>).text)
      i++
    }
    const children: ReactNode[] = []
    paraLines.forEach((t, li) => {
      if (li > 0) children.push(createElement('br', { key: `br-${li}` }))
      children.push(...renderInline(t, `p${key}-${li}`))
    })
    blocks.push(
      createElement('p', { key: key++, className: 'whitespace-pre-wrap' }, children),
    )
  }

  return blocks
}
