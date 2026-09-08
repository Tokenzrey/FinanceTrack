import { describe, expect, it } from 'vitest'

import { insertLink, toggleLinePrefix, wrapInline } from './description-toolbar'

describe('wrapInline', () => {
  it('wraps a selection and reselects the inner text', () => {
    const r = wrapInline('a bold c', 2, 6, '**')
    expect(r.value).toBe('a **bold** c')
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('bold')
  })

  it('with no selection inserts the pair with the caret between (never a lone marker)', () => {
    const r = wrapInline('ab', 1, 1, '**')
    expect(r.value).toBe('a****b')
    expect(r.selectionStart).toBe(3)
    expect(r.selectionEnd).toBe(3)
    // caret sits between the two markers
    expect(r.value.slice(0, r.selectionStart)).toBe('a**')
    expect(r.value.slice(r.selectionStart)).toBe('**b')
  })
})

describe('toggleLinePrefix', () => {
  it('adds a prefix to the current line when absent', () => {
    const r = toggleLinePrefix('one\ntwo\nthree', 5, 5, '- ')
    expect(r.value).toBe('one\n- two\nthree')
  })

  it('removes the prefix when already present (toggle off)', () => {
    const r = toggleLinePrefix('- one\n- two', 2, 2, '- ')
    expect(r.value).toBe('one\n- two')
  })

  it('toggles every line in a multi-line selection, no double prefixes', () => {
    const src = 'a\nb\nc'
    const r = toggleLinePrefix(src, 0, src.length, '- ')
    expect(r.value).toBe('- a\n- b\n- c')
    const off = toggleLinePrefix(r.value, r.selectionStart, r.selectionEnd, '- ')
    expect(off.value).toBe('a\nb\nc')
  })

  it('checkbox prefix never stacks on an existing bullet line semantics', () => {
    const r = toggleLinePrefix('task', 0, 0, '- [ ] ')
    expect(r.value).toBe('- [ ] task')
  })

  it('checkbox button toggles off an existing - [x] line (strips the checked variant)', () => {
    const r = toggleLinePrefix('- [x] done', 6, 6, '- [ ] ')
    expect(r.value).toBe('done')
  })

  it('list button on a - [x] line converts checkbox → bullet', () => {
    const r = toggleLinePrefix('- [x] done', 6, 6, '- ')
    expect(r.value).toBe('- done')
  })

  it('checkbox button on a bullet line converts bullet → checkbox (no stacking)', () => {
    const r = toggleLinePrefix('- item', 2, 2, '- [ ] ')
    expect(r.value).toBe('- [ ] item')
  })

  it('multi-line all-checkbox selection + checkbox button → all off', () => {
    const src = '- [ ] a\n- [ ] b'
    const r = toggleLinePrefix(src, 0, src.length, '- [ ] ')
    expect(r.value).toBe('a\nb')
  })

  it('a selection ending exactly at a line start does not drag in the next line', () => {
    // 6 = start of "beta", 11 = start of "gamma"
    const r = toggleLinePrefix('alpha\nbeta\ngamma', 6, 11, '- ')
    expect(r.value).toBe('alpha\n- beta\ngamma')
  })
})

describe('insertLink', () => {
  it('with a selection uses it as text and selects the url placeholder', () => {
    const r = insertLink('see here', 4, 8)
    expect(r.value).toBe('see [here](url)')
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('url')
  })

  it('with no selection inserts [teks](url) and selects teks', () => {
    const r = insertLink('', 0, 0)
    expect(r.value).toBe('[teks](url)')
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('teks')
  })
})
