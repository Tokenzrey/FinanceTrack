import { describe, it, expect } from 'vitest'
import { parseWhen, stripWhenTokens } from './parse-when'

const TZ = 'Asia/Jakarta' // UTC+7, no DST
const now = new Date('2026-09-08T02:00:00.000Z') // 09:00 WIB, Selasa

describe('parseWhen', () => {
  it('returns null when there is no time hint', () => {
    expect(parseWhen('beli galon', now, TZ)).toBeNull()
  })

  it('"besok jam 3 sore" → next day 15:00 WIB = 08:00 UTC, no recurrence', () => {
    const r = parseWhen('beli galon besok jam 3 sore', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-09T08:00:00.000Z')
    expect(r.recurrence).toBeNull()
    expect(r.timeWasImplicit).toBe(false)
  })

  it('date word with no clock → 09:00 local and timeWasImplicit', () => {
    const r = parseWhen('lusa', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-10T02:00:00.000Z') // 09:00 WIB
    expect(r.timeWasImplicit).toBe(true)
  })

  it('"dalam 2 jam" → now + 2h', () => {
    const r = parseWhen('rapat dalam 2 jam', now, TZ)!
    expect(r.at.toISOString()).toBe('2026-09-08T04:00:00.000Z')
  })

  it('"tiap hari jam 7 pagi" → daily recurrence, next occurrence today 07:00 WIB already passed → tomorrow', () => {
    const r = parseWhen('minum obat tiap hari jam 7 pagi', now, TZ)!
    expect(r.recurrence).toEqual({ freq: 'daily', until: null })
    expect(r.at.toISOString()).toBe('2026-09-09T00:00:00.000Z') // besok 07:00 WIB
  })

  it('"tiap hari kerja jam 8" from Tuesday → Wednesday 08:00', () => {
    const r = parseWhen('standup tiap hari kerja jam 8', now, TZ)!
    expect(r.recurrence).toEqual({ freq: 'weekday', until: null })
    expect(r.at.toISOString()).toBe('2026-09-09T01:00:00.000Z')
  })

  it('stripWhenTokens removes the temporal phrase', () => {
    expect(stripWhenTokens('beli galon besok jam 3 sore')).toBe('beli galon')
    expect(stripWhenTokens('minum obat tiap hari jam 7 pagi')).toBe('minum obat')
  })
})
