/**
 * Pure string transforms for the description toolbar. Each returns the next
 * textarea value plus the selection to re-apply after the controlled re-render.
 * No DOM — unit-testable directly.
 */

export type EditResult = { value: string; selectionStart: number; selectionEnd: number }

/** Wrap the selection in `marker` on both sides. With no selection, insert the
 *  pair and put the caret between the markers (`**|**`) — never a lone marker. */
export function wrapInline(
  value: string,
  start: number,
  end: number,
  marker: string,
): EditResult {
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)
  if (selected.length === 0) {
    const caret = start + marker.length
    return {
      value: `${before}${marker}${marker}${after}`,
      selectionStart: caret,
      selectionEnd: caret,
    }
  }
  return {
    value: `${before}${marker}${selected}${marker}${after}`,
    selectionStart: start + marker.length,
    selectionEnd: end + marker.length,
  }
}

/** Remove a leading list marker (`- [ ] ` / `- [x] ` / `- `, longest first). */
function stripListMarker(line: string): string {
  const m = /^- (\[[ xX]\] )?/.exec(line)
  return m ? line.slice(m[0].length) : line
}

/** Toggle a line prefix on every line touched by the selection.
 *
 *  For the two list markers the toolbar uses (`- ` Daftar, `- [ ] ` Checkbox)
 *  this is marker-aware: it converts between bullet and checkbox instead of
 *  stacking a second marker, and treats `- [ ] ` / `- [x] ` as the same
 *  "checkbox" state. For any other prefix it falls back to the plain
 *  add-if-absent / strip-if-present behaviour. Selection is expanded to cover
 *  the affected lines. */
export function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): EditResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length
  // A selection whose end sits exactly at a line start doesn't really include
  // that trailing line — stop at the newline before it, not past it.
  if (end > start && end > 0 && value[end - 1] === '\n' && lineEnd >= end) {
    lineEnd = end - 1
  }

  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const isListMarker = prefix === '- ' || prefix === '- [ ] '

  let next: string
  if (isListMarker) {
    const hasTarget =
      prefix === '- '
        ? (l: string) => /^- (?!\[[ xX]\] )/.test(l)
        : (l: string) => /^- \[[ xX]\] /.test(l)
    const allTarget = lines.every(hasTarget)
    next = lines
      .map((l) => (allTarget ? stripListMarker(l) : prefix + stripListMarker(l)))
      .join('\n')
  } else {
    const allPrefixed = lines.every((l) => l.startsWith(prefix))
    next = lines
      .map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l))
      .join('\n')
  }

  return {
    value: value.slice(0, lineStart) + next + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + next.length,
  }
}

/** `[text](url)`. With a selection, it's the link text and the literal word
 *  `url` is selected for the user to type over. With none, `teks` is selected. */
export function insertLink(value: string, start: number, end: number): EditResult {
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)
  const text = selected.length > 0 ? selected : 'teks'
  const placeholder = selected.length > 0 ? 'url' : 'teks'
  const inserted = `[${text}](url)`
  // Select the placeholder word inside the freshly inserted snippet. `url` sits
  // just before the closing paren; `teks` is the only text when there's no
  // selection — lastIndexOf lands on the right one either way.
  const relOffset = inserted.lastIndexOf(placeholder)
  const selStart = before.length + relOffset
  return {
    value: `${before}${inserted}${after}`,
    selectionStart: selStart,
    selectionEnd: selStart + placeholder.length,
  }
}
