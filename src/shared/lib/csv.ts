/**
 * Hand-rolled CSV parsing — no dependency. Real-world exports (bank mutations,
 * e-wallets, spreadsheets) vary too much in delimiter and quoting to trust one
 * library's defaults blindly, and the format itself is simple enough to parse directly.
 */

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export type CsvDateFormat = 'dmy' | 'mdy' | 'ymd'

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text)
  const allRows = parseRows(text.replace(/^\uFEFF/, ''), delimiter) // strip a UTF-8 BOM
  const [headers = [], ...body] = allRows
  return {
    headers: headers.map((h) => h.trim()),
    rows: body.filter((row) => row.some((cell) => cell.trim() !== '')),
  }
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = -1
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

/** RFC4180-ish: quoted fields may embed the delimiter or a newline; `""` escapes a quote. */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // swallow — the following \n (or end of text) closes the row
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Parses one date cell in the chosen day/month/year order. Rejects anything that isn't
 * three numeric groups, and rejects a day/month combination `Date` would otherwise
 * silently roll over (e.g. 31/02 becoming March 3rd).
 */
export function parseCsvDate(raw: string, format: CsvDateFormat): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const parts = trimmed.split(/[/\-.]/).map((p) => p.trim())
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null

  const nums = parts.map(Number)
  let day: number, month: number, year: number
  if (format === 'ymd') [year, month, day] = nums
  else if (format === 'mdy') [month, day, year] = nums
  else [day, month, year] = nums

  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1) return null
  return date
}

/**
 * Parses an amount cell, keeping sign — `-150000` or `(150000)` both read as negative,
 * the common bank-export convention for a debit. Like `parseIDR`, only digits (and the
 * sign) survive, so a decimal-cents cell (e.g. "150.000,50") is read as whole Rupiah —
 * IDR amounts are practically always whole numbers in this app already.
 */
export function parseCsvAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-')
  const digitsOnly = trimmed.replace(/[^\d]/g, '')
  if (!digitsOnly) return null
  const value = Number(digitsOnly)
  return negative ? -value : value
}
