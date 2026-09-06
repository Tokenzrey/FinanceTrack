import type { BotPrefs } from './types'

/**
 * `/mode` and `/atur` — the user's own knobs on how the bot behaves.
 *
 * Deterministic, like every other command parser here: a settings command that is
 * misread would silently change how transactions get recorded, which is worse than
 * telling the user the word was not understood.
 */

export type PrefsCommand =
  | { kind: 'show' }
  | { kind: 'set'; patch: Partial<BotPrefs> }
  | { kind: 'invalid'; field: string }
  | { kind: 'none' }

const ON = /^(on|nyala|aktif|ya|true|1)$/i
const OFF = /^(off|mati|nonaktif|tidak|false|0)$/i

function boolValue(raw: string): boolean | null {
  if (ON.test(raw)) return true
  if (OFF.test(raw)) return false
  return null
}

function setVerbosity(raw: string): PrefsCommand {
  const word = raw.toLowerCase()
  if (word === 'ringkas' || word === 'singkat') return { kind: 'set', patch: { verbosity: 'ringkas' } }
  if (word === 'detail' || word === 'lengkap') return { kind: 'set', patch: { verbosity: 'detail' } }
  return { kind: 'invalid', field: 'mode' }
}

export function parsePrefsCommand(raw: string): PrefsCommand {
  const text = raw.trim()
  if (!text) return { kind: 'none' }

  const mode = text.match(/^\/?mode(?:\s+(\S+))?$/i)
  if (mode) return mode[1] ? setVerbosity(mode[1]) : { kind: 'show' }

  const atur = text.match(/^\/?(?:atur|pengaturan|setting)(?:\s+(\S+)(?:\s+(.+))?)?$/i)
  if (!atur) return { kind: 'none' }
  if (!atur[1]) return { kind: 'show' }

  const field = atur[1].toLowerCase()
  const value = (atur[2] ?? '').trim()

  if (field === 'mode' || field === 'verbositas') return value ? setVerbosity(value) : { kind: 'invalid', field }

  if (field === 'autoaccept' || field === 'ambang') {
    if (!/^\d{1,3}$/.test(value)) return { kind: 'invalid', field }
    return { kind: 'set', patch: { autoAcceptConfidence: Math.min(100, Math.max(0, Number(value))) } }
  }

  if (field === 'selalutinjau' || field === 'tinjau') {
    const on = boolValue(value)
    return on === null ? { kind: 'invalid', field } : { kind: 'set', patch: { alwaysReview: on } }
  }

  if (field === 'insight' || field === 'insights') {
    const on = boolValue(value)
    return on === null ? { kind: 'invalid', field } : { kind: 'set', patch: { showInsights: on } }
  }

  return { kind: 'invalid', field }
}
