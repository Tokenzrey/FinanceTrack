import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderMarkdownLite, safeUrl } from './markdown-lite'

function html(src: string) {
  const { container } = render(<>{renderMarkdownLite(src)}</>)
  return container
}

describe('safeUrl', () => {
  it('passes http / https / mailto through (normalized)', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeUrl('  https://x.test/  ')).toBe('https://x.test/')
  })

  it('rejects javascript / data / vbscript', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull()
    // Whitespace/control-char obfuscation still rejected.
    expect(safeUrl('java\tscript:alert(1)')).toBeNull()
    expect(safeUrl(' java\nscript:alert(1)')).toBeNull()
  })

  it('rejects relative / malformed URLs (subset requires absolute)', () => {
    expect(safeUrl('/foo/bar')).toBeNull()
    expect(safeUrl('foo:bar')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(safeUrl('')).toBeNull()
    expect(safeUrl('ftp://example.com')).toBeNull()
  })
})

describe('renderMarkdownLite — subset element types', () => {
  it('# / ## / ### → h3 / h4 / h5', () => {
    const c = html('# One\n## Two\n### Three')
    expect(c.querySelector('h3')?.textContent).toBe('One')
    expect(c.querySelector('h4')?.textContent).toBe('Two')
    expect(c.querySelector('h5')?.textContent).toBe('Three')
    // Never a real h1/h2 — descriptions can't out-shout the section title.
    expect(c.querySelector('h1')).toBeNull()
    expect(c.querySelector('h2')).toBeNull()
  })

  it('- lines → ul.list-disc > li', () => {
    const c = html('- a\n- b')
    const ul = c.querySelector('ul')
    expect(ul?.className).toContain('list-disc')
    expect(ul?.querySelectorAll('li')).toHaveLength(2)
  })

  it('- [ ] / - [x] → ul.list-none > li with a disabled checkbox', () => {
    const c = html('- [ ] todo\n- [x] done')
    const ul = c.querySelector('ul')
    expect(ul?.className).toContain('list-none')
    const boxes = c.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    boxes.forEach((b) => expect((b as HTMLInputElement).disabled).toBe(true))
    expect((boxes[0] as HTMLInputElement).checked).toBe(false)
    expect((boxes[1] as HTMLInputElement).checked).toBe(true)
  })

  it('**bold** → strong, *italic* → em, `code` → code', () => {
    const c = html('a **b** c *d* e `f` g')
    expect(c.querySelector('strong')?.textContent).toBe('b')
    expect(c.querySelector('em')?.textContent).toBe('d')
    expect(c.querySelector('code')?.textContent).toBe('f')
  })

  it('does not treat ** as italic', () => {
    const c = html('**bold**')
    expect(c.querySelector('strong')?.textContent).toBe('bold')
    expect(c.querySelector('em')).toBeNull()
  })

  it('[text](https://…) → a with safe href + hardened rel', () => {
    const c = html('see [docs](https://example.com/x)')
    const a = c.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://example.com/x')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(a?.textContent).toBe('docs')
  })

  it('code content is literal — no nested parsing', () => {
    const c = html('`**not bold**`')
    expect(c.querySelector('code')?.textContent).toBe('**not bold**')
    expect(c.querySelector('strong')).toBeNull()
  })

  it('a stray * in prose does not swallow a later code span', () => {
    const c = html('area = w*h and `w*h` again')
    expect(c.querySelector('code')?.textContent).toBe('w*h')
    expect(c.querySelector('em')).toBeNull()
    // Both backtick-delimited pieces survive as code text.
    expect(c.textContent).toContain('area = w*h and w*h again')
  })

  it('a stray * before a link does not eat the ] / )', () => {
    const c = html('one * two [link](https://a.test) three')
    const a = c.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://a.test/')
    expect(a?.textContent).toBe('link')
    expect(c.querySelector('em')).toBeNull()
  })

  it('a genuine *italic* in a run with no code/link still renders', () => {
    const c = html('a *real italic* here')
    expect(c.querySelector('em')?.textContent).toBe('real italic')
  })

  it('plain line → p.whitespace-pre-wrap', () => {
    const c = html('just text')
    const p = c.querySelector('p')
    expect(p?.className).toContain('whitespace-pre-wrap')
    expect(p?.textContent).toBe('just text')
  })
})

describe('renderMarkdownLite — XSS attack cases', () => {
  it('<script> in source is inert text, never an element', () => {
    const c = html('<script>alert(1)</script>')
    expect(c.querySelector('script')).toBeNull()
    expect(c.textContent).toContain('<script>alert(1)</script>')
  })

  it('<img onerror=…> is inert text, never an img element', () => {
    const c = html('<img src=x onerror=alert(1)>')
    expect(c.querySelector('img')).toBeNull()
    expect(c.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('[x](javascript:…) → literal text, no anchor', () => {
    const c = html('[x](javascript:alert(1))')
    expect(c.querySelector('a')).toBeNull()
    expect(c.textContent).toContain('[x](javascript:alert(1))')
  })

  it('[x](data:text/html,…) → literal text, no anchor', () => {
    const c = html('[x](data:text/html,<script>alert(1)</script>)')
    expect(c.querySelector('a')).toBeNull()
    expect(c.textContent).toContain('[x](data:text/html,')
  })

  it('a bare javascript: URL in text is never linkified (no autolink)', () => {
    const c = html('go to javascript:alert(1) now')
    expect(c.querySelector('a')).toBeNull()
    expect(c.textContent).toContain('javascript:alert(1)')
  })

  it('never sets an on* attribute anywhere', () => {
    const c = html('# h\n- [x] `x` **b** [l](https://a.test)\n<img onerror=alert(1)>')
    c.querySelectorAll('*').forEach((el) => {
      for (const attr of el.getAttributeNames()) {
        expect(attr.startsWith('on')).toBe(false)
      }
    })
  })
})

describe('renderMarkdownLite — passthrough', () => {
  it('text outside the subset survives verbatim', () => {
    const c = html('1 < 2 && 3 > 2 — plain, ~unmarked~ text')
    expect(c.textContent).toBe('1 < 2 && 3 > 2 — plain, ~unmarked~ text')
    expect(c.querySelectorAll('strong,em,code,a,ul,h3,h4,h5')).toHaveLength(0)
  })

  it('an unclosed marker is left as text', () => {
    const c = html('a **b without close')
    expect(c.querySelector('strong')).toBeNull()
    expect(c.textContent).toBe('a **b without close')
  })
})
