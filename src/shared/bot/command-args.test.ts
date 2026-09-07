import { describe, expect, it } from 'vitest'
import { parseCommandArgs } from './command-args'

describe('parseCommandArgs', () => {
  it('reads a bare command', () => {
    expect(parseCommandArgs('/ringkasan')).toEqual({ command: 'ringkasan', args: [], raw: '' })
    expect(parseCommandArgs('ringkasan')).toEqual({ command: 'ringkasan', args: [], raw: '' })
  })

  it('splits arguments and keeps the untouched remainder', () => {
    expect(parseCommandArgs('/riwayat 10 makan siang')).toEqual({
      command: 'riwayat',
      args: ['10', 'makan', 'siang'],
      raw: '10 makan siang',
    })
  })

  it('lowercases the command but never the arguments', () => {
    expect(parseCommandArgs('/CARI Kopi Susu')?.command).toBe('cari')
    expect(parseCommandArgs('/CARI Kopi Susu')?.raw).toBe('Kopi Susu')
  })

  it('returns null for a message that is not a command', () => {
    expect(parseCommandArgs('makan siang 35rb')).toBeNull()
    expect(parseCommandArgs('')).toBeNull()
  })

  it('does not treat a bare amount as a command', () => {
    expect(parseCommandArgs('35rb')).toBeNull()
  })
})
