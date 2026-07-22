import type { ConvoyPosition } from './types'

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('CSVの引用符が閉じられていません。')
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    if (row.some((value) => value.length > 0)) rows.push(row)
  }
  return rows
}

const requiredHeaders = [
  'convoy_id', 'waytype', 'state', 'state_code', 'speed_kmh',
  'x', 'y', 'z', 'route_index',
] as const

function requiredNumber(value: string | undefined, column: string): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`CSVの${column}が空です。`)
  }
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`CSVの${column}が数値ではありません。`)
  return result
}

export function parseConvoyPositions(input: string): ConvoyPosition[] {
  const rows = parseCsv(input)
  if (rows.length === 0) throw new Error('位置CSVが空です。')
  const headers = rows[0].map((header) => header.trim())
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]))

  for (const header of requiredHeaders) {
    if (indexes[header] === undefined) throw new Error(`位置CSVに${header}列がありません。`)
  }

  return rows.slice(1).map((row) => {
    const value = (name: typeof requiredHeaders[number]) => row[indexes[name]]
    const routeIndex = value('route_index')?.trim()
    return {
      convoy_id: requiredNumber(value('convoy_id'), 'convoy_id'),
      waytype: value('waytype') ?? '',
      state: value('state') ?? '',
      state_code: requiredNumber(value('state_code'), 'state_code'),
      speed_kmh: requiredNumber(value('speed_kmh'), 'speed_kmh'),
      x: requiredNumber(value('x'), 'x'),
      y: requiredNumber(value('y'), 'y'),
      z: requiredNumber(value('z'), 'z'),
      route_index: routeIndex ? requiredNumber(routeIndex, 'route_index') : null,
    }
  })
}
