import { describe, expect, it } from 'vitest'
import { matchReadCommand } from './parse-intent'

describe('matchReadCommand', () => {
  it('matches read commands by plain keyword, case-insensitively', () => {
    expect(matchReadCommand('ringkasan')).toBe('get_summary')
    expect(matchReadCommand('Summary')).toBe('get_summary')
    expect(matchReadCommand('sisa')).toBe('get_balance')
    expect(matchReadCommand('SALDO')).toBe('get_balance')
    expect(matchReadCommand('kategori')).toBe('list_categories')
    expect(matchReadCommand('categories')).toBe('list_categories')
    expect(matchReadCommand('bantuan')).toBe('help')
    expect(matchReadCommand('/start')).toBe('help')
    expect(matchReadCommand('/help')).toBe('help')
  })

  it('tolerates surrounding whitespace', () => {
    expect(matchReadCommand('  ringkasan  ')).toBe('get_summary')
  })

  it('does not match a transaction message that merely contains a keyword', () => {
    expect(matchReadCommand('sisa uangku abis buat makan 35rb')).toBeNull()
    expect(matchReadCommand('gaji bulan ini masuk 5jt')).toBeNull()
  })

  it('returns null for anything else', () => {
    expect(matchReadCommand('makan siang 35rb')).toBeNull()
    expect(matchReadCommand('')).toBeNull()
    expect(matchReadCommand('ABC123')).toBeNull()
  })
})
