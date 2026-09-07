import { describe, expect, it } from 'vitest'
import { parsePrefsCommand } from './prefs-commands'

describe('parsePrefsCommand', () => {
  it('shows the current settings for a bare /atur or /mode', () => {
    expect(parsePrefsCommand('/atur')).toEqual({ kind: 'show' })
    expect(parsePrefsCommand('atur')).toEqual({ kind: 'show' })
    expect(parsePrefsCommand('/mode')).toEqual({ kind: 'show' })
  })

  it('sets verbosity from either command form', () => {
    expect(parsePrefsCommand('/mode ringkas')).toEqual({ kind: 'set', patch: { verbosity: 'ringkas' } })
    expect(parsePrefsCommand('/mode detail')).toEqual({ kind: 'set', patch: { verbosity: 'detail' } })
    expect(parsePrefsCommand('/atur mode ringkas')).toEqual({ kind: 'set', patch: { verbosity: 'ringkas' } })
  })

  it('sets the auto-accept threshold and clamps it to 0-100', () => {
    expect(parsePrefsCommand('/atur autoaccept 80')).toEqual({ kind: 'set', patch: { autoAcceptConfidence: 80 } })
    expect(parsePrefsCommand('/atur autoaccept 500')).toEqual({ kind: 'set', patch: { autoAcceptConfidence: 100 } })
  })

  it('sets the boolean switches from natural on/off words', () => {
    expect(parsePrefsCommand('/atur selalutinjau on')).toEqual({ kind: 'set', patch: { alwaysReview: true } })
    expect(parsePrefsCommand('/atur selalutinjau off')).toEqual({ kind: 'set', patch: { alwaysReview: false } })
    expect(parsePrefsCommand('/atur insight mati')).toEqual({ kind: 'set', patch: { showInsights: false } })
    expect(parsePrefsCommand('/atur insight nyala')).toEqual({ kind: 'set', patch: { showInsights: true } })
  })

  it('reports an unknown field instead of silently ignoring it', () => {
    expect(parsePrefsCommand('/atur warna biru')).toEqual({ kind: 'invalid', field: 'warna' })
  })

  it('reports an unparseable value for a known field', () => {
    expect(parsePrefsCommand('/atur autoaccept banyak')).toEqual({ kind: 'invalid', field: 'autoaccept' })
    expect(parsePrefsCommand('/mode cepat')).toEqual({ kind: 'invalid', field: 'mode' })
  })

  it('returns none for anything that is not a settings command', () => {
    expect(parsePrefsCommand('makan siang 35rb')).toEqual({ kind: 'none' })
    expect(parsePrefsCommand('/ringkasan')).toEqual({ kind: 'none' })
  })
})
