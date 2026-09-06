export interface CommandArgs {
  /** Lower-cased, without the leading slash. */
  command: string
  args: string[]
  /** Everything after the command, untouched — descriptions and search terms need
   *  their original casing. */
  raw: string
}

/** With a leading slash, everything up to the first space is the command and the rest
 *  is free-form. Without one, only a message that is a single all-letters word counts,
 *  so "makan siang 35rb" and "35rb" are never mistaken for a command. */
const SLASH_RE = /^\/([a-z][a-z_]*)\b\s*([\s\S]*)$/i
const BARE_RE = /^([a-z][a-z_]*)$/i

export function parseCommandArgs(text: string): CommandArgs | null {
  const trimmed = text.trim()
  const match = trimmed.match(SLASH_RE) ?? trimmed.match(BARE_RE)
  if (!match) return null
  const raw = (match[2] ?? '').trim()
  return { command: match[1].toLowerCase(), args: raw ? raw.split(/\s+/) : [], raw }
}
