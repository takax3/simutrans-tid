import type { ConvoyPosition, WayTopologyTile } from './types'

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

const topologyHeaders = [
  'x', 'y', 'z', 'waytype', 'physical_ribi', 'blocked_ribi',
  'north_z', 'east_z', 'south_z', 'west_z',
] as const

export function parseWayTopology(input: string): WayTopologyTile[] {
  const rows = parseCsv(input)
  if (rows.length === 0) throw new Error('交通路トポロジーCSVが空です。')
  const indexes = Object.fromEntries(rows[0].map((header, index) => [header.trim(), index]))
  for (const header of topologyHeaders) {
    if (indexes[header] === undefined) throw new Error(`交通路トポロジーCSVに${header}列がありません。`)
  }
  const optionalNumber = (value: string | undefined, column: string) => {
    if (value === undefined || value.trim() === '') return null
    return requiredNumber(value, column)
  }
  return rows.slice(1).map((row) => ({
    x: requiredNumber(row[indexes.x], 'x'),
    y: requiredNumber(row[indexes.y], 'y'),
    z: requiredNumber(row[indexes.z], 'z'),
    waytype: row[indexes.waytype] ?? '',
    physical_ribi: requiredNumber(row[indexes.physical_ribi], 'physical_ribi'),
    blocked_ribi: requiredNumber(row[indexes.blocked_ribi], 'blocked_ribi'),
    north_z: optionalNumber(row[indexes.north_z], 'north_z'),
    east_z: optionalNumber(row[indexes.east_z], 'east_z'),
    south_z: optionalNumber(row[indexes.south_z], 'south_z'),
    west_z: optionalNumber(row[indexes.west_z], 'west_z'),
  }))
}
