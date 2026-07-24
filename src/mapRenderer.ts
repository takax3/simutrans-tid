import { companyPrimaryColor } from './palette'
import type { Company, DisplayedLine, LayerVisibility, PositionGroup, RoadSign, Stop, StopTile, WayTopologyTile } from './types'

const COLORS = {
  background: '#edf0e8',
  grid: '#c9cec4',
  majorGrid: '#a9b1a7',
  border: '#50625b',
  driving: '#087f8c',
  stopped: '#d8752c',
  other: '#65558f',
  markerBorder: '#ffffff',
  stop: '#263b50',
  stopBorder: '#ffffff',
  stopBusyBorder: '#c95c2c',
  text: '#24342f',
}

const MAX_BACKING_DIMENSION = 8_192
const MAX_BACKING_PIXELS = 32_000_000

export function calculateBackingScale(
  width: number,
  height: number,
  zoom: number,
  devicePixelRatio: number,
): number {
  const requestedScale = zoom * Math.max(1, devicePixelRatio)
  const dimensionScale = Math.min(MAX_BACKING_DIMENSION / width, MAX_BACKING_DIMENSION / height)
  const pixelScale = Math.sqrt(MAX_BACKING_PIXELS / (width * height))
  return Math.max(0.1, Math.min(requestedScale, dimensionScale, pixelScale))
}

function markerColor(state: string, speed: number): string {
  if (state === 'driving' && speed > 0) return COLORS.driving
  if (['loading', 'waiting_for_clearance', 'can_start'].includes(state)) return COLORS.stopped
  return COLORS.other
}

export function lineColor(colorIndex: number): string {
  const hue = Math.round((colorIndex * 137.508) % 360)
  return `hsl(${hue} 67% 42% / 0.58)`
}

export function companyLineColor(company: Company | undefined): string | null {
  const color = company ? companyPrimaryColor(company) : null
  return color ? `${color}94` : null
}

export function signalStateColor(state: string): string {
  const normalized = state.toLowerCase()
  if (['green', 'clear', 'proceed'].includes(normalized)) return '#22a447'
  if (['yellow', 'caution', 'warning'].includes(normalized)) return '#e3ad24'
  if (['red', 'stop', 'danger'].includes(normalized)) return '#d83a32'
  return '#76817d'
}

const signalDirections = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
} as const

export function drawMap(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  groups: PositionGroup[],
  stops: Stop[],
  stopTiles: StopTile[],
  companies: Company[],
  wayTopology: WayTopologyTile[],
  lines: DisplayedLine[],
  layers: LayerVisibility,
  colorLinesByCompany: boolean,
  zoom: number,
  roadSigns: RoadSign[] = [],
  showSignals = true,
  topologySeed: WayTopologyTile | null = null,
  cutTopologyTiles: WayTopologyTile[] = [],
): void {
  const backingScale = calculateBackingScale(
    width,
    height,
    zoom,
    globalThis.devicePixelRatio ?? 1,
  )
  const backingWidth = Math.max(1, Math.round(width * backingScale))
  const backingHeight = Math.max(1, Math.round(height * backingScale))
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  canvas.style.width = `${width * zoom}px`
  canvas.style.height = `${height * zoom}px`

  const context = canvas.getContext('2d')
  if (!context) return

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, backingWidth, backingHeight)
  context.setTransform(backingScale, 0, 0, backingScale, 0, 0)
  context.fillStyle = COLORS.background
  context.fillRect(0, 0, width, height)

  for (let x = 0; x <= width; x += 100) {
    context.beginPath()
    context.strokeStyle = x % 500 === 0 ? COLORS.majorGrid : COLORS.grid
    context.lineWidth = (x % 500 === 0 ? 1.2 : 0.7) / zoom
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()

  }
  for (let y = 0; y <= height; y += 100) {
    context.beginPath()
    context.strokeStyle = y % 500 === 0 ? COLORS.majorGrid : COLORS.grid
    context.lineWidth = (y % 500 === 0 ? 1.2 : 0.7) / zoom
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  const companiesById = new Map(companies.map((company) => [company.id, company]))

  if (layers.ways) {
    context.strokeStyle = '#59635f'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 1.35 / zoom
    context.beginPath()
    for (const tile of wayTopology) {
      const ribi = tile.physical_ribi
      if (ribi & 1) { context.moveTo(tile.x, tile.y); context.lineTo(tile.x, tile.y - 0.5) }
      if (ribi & 2) { context.moveTo(tile.x, tile.y); context.lineTo(tile.x + 0.5, tile.y) }
      if (ribi & 4) { context.moveTo(tile.x, tile.y); context.lineTo(tile.x, tile.y + 0.5) }
      if (ribi & 8) { context.moveTo(tile.x, tile.y); context.lineTo(tile.x - 0.5, tile.y) }
    }
    context.stroke()

  }

  if (topologySeed) {
    const pinRadius = 5 / zoom
    context.beginPath()
    context.fillStyle = '#e3403a'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1.5 / zoom
    context.arc(topologySeed.x, topologySeed.y - pinRadius * 0.7, pinRadius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.beginPath()
    context.strokeStyle = '#e3403a'
    context.lineWidth = 2 / zoom
    context.moveTo(topologySeed.x, topologySeed.y)
    context.lineTo(topologySeed.x, topologySeed.y - pinRadius * 0.3)
    context.stroke()
  }

  if (cutTopologyTiles.length > 0) {
    context.font = `700 ${16 / zoom}px "Segoe UI Symbol", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#b52d27'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 3 / zoom
    for (const tile of cutTopologyTiles) {
      context.strokeText?.('✂', tile.x, tile.y)
      context.fillText('✂', tile.x, tile.y)
    }
  }

  if (layers.lines) {
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2.5 / zoom
    for (const line of lines) {
      if (line.entries.length < 2) continue
      context.beginPath()
      context.strokeStyle = colorLinesByCompany
        ? companyLineColor(companiesById.get(line.company_id)) ?? lineColor(line.color_index)
        : lineColor(line.color_index)
      context.moveTo(line.entries[0].position.x, line.entries[0].position.y)
      for (const entry of line.entries.slice(1)) {
        context.lineTo(entry.position.x, entry.position.y)
      }
      context.stroke()
    }
  }

  if (layers.ways && showSignals) {
    const offset = 3.5 / zoom
    const radius = 2.5 / zoom
    const triangleSize = 3 / zoom
    context.lineWidth = 1.1 / zoom
    for (const sign of roadSigns) {
      if (sign.state === null) continue
      context.fillStyle = signalStateColor(sign.state)
      context.strokeStyle = '#17201d'
      if (sign.directions.length === 0) {
        context.beginPath()
        context.arc(sign.position.x, sign.position.y, radius, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        continue
      }
      for (const direction of sign.directions) {
        const vector = signalDirections[direction]
        if (!vector) continue
        const x = sign.position.x + vector.dx * offset
        const y = sign.position.y + vector.dy * offset
        const perpendicularX = -vector.dy
        const perpendicularY = vector.dx
        const tipX = x - vector.dx * triangleSize
        const tipY = y - vector.dy * triangleSize
        const baseCenterX = x + vector.dx * triangleSize * 0.6
        const baseCenterY = y + vector.dy * triangleSize * 0.6
        const baseOffset = triangleSize * 0.85
        context.beginPath()
        context.moveTo(tipX, tipY)
        context.lineTo(baseCenterX + perpendicularX * baseOffset, baseCenterY + perpendicularY * baseOffset)
        context.lineTo(baseCenterX - perpendicularX * baseOffset, baseCenterY - perpendicularY * baseOffset)
        context.lineTo(tipX, tipY)
        context.fill()
        context.stroke()
      }
    }
  }

  if (layers.stops) {
    const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
    for (const tile of stopTiles) {
      const stop = stopsById.get(tile.stop_id)
      if (!stop) continue
      const owner = stop.owner_company_id === null
        ? undefined
        : companiesById.get(stop.owner_company_id)
      const color = owner ? companyPrimaryColor(owner) ?? COLORS.stop : COLORS.stop
      context.fillStyle = `${color}66`
      context.fillRect(tile.x - 0.5, tile.y - 0.5, 1, 1)
    }

    const stopRadius = 4.5 / zoom
    for (const stop of stops) {
      const isBusy = stop.passenger_capacity > 0
        && stop.passenger_waiting / stop.passenger_capacity >= 0.8
      const owner = stop.owner_company_id === null
        ? undefined
        : companiesById.get(stop.owner_company_id)
      context.fillStyle = owner ? companyPrimaryColor(owner) ?? COLORS.stop : COLORS.stop
      context.strokeStyle = isBusy ? COLORS.stopBusyBorder : COLORS.stopBorder
      context.lineWidth = 1.5 / zoom
      context.fillRect(
        stop.position.x - stopRadius,
        stop.position.y - stopRadius,
        stopRadius * 2,
        stopRadius * 2,
      )
      context.strokeRect(
        stop.position.x - stopRadius,
        stop.position.y - stopRadius,
        stopRadius * 2,
        stopRadius * 2,
      )
    }
  }

  const radius = 6 / zoom
  if (layers.convoys) for (const group of groups) {
    const representative = group.convoys[0]
    context.beginPath()
    context.fillStyle = markerColor(representative.state, representative.speed_kmh)
    context.strokeStyle = COLORS.markerBorder
    context.lineWidth = 2 / zoom
    context.arc(group.x, group.y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    if (group.convoys.length > 1) {
      const badgeRadius = 7 / zoom
      const badgeX = group.x + radius * 0.8
      const badgeY = group.y - radius * 0.8
      context.beginPath()
      context.fillStyle = COLORS.text
      context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#ffffff'
      context.font = `700 ${9 / zoom}px system-ui`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(group.convoys.length), badgeX, badgeY)
    }
  }

  context.strokeStyle = COLORS.border
  context.lineWidth = 2 / zoom
  context.strokeRect(0, 0, width, height)
  context.fillStyle = COLORS.text
  context.font = `600 ${12 / zoom}px ui-monospace, monospace`
  context.textBaseline = 'top'
  context.textAlign = 'left'
  context.fillText('(0, 0)', 8 / zoom, 8 / zoom)
  context.textAlign = 'right'
  context.textBaseline = 'bottom'
  context.fillText(`(${width}, ${height})`, width - 8 / zoom, height - 8 / zoom)
}
