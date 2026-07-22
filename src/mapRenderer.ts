import type { DisplayedLine, LayerVisibility, PositionGroup, Stop } from './types'

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
  stopBusy: '#c95c2c',
  stopBorder: '#ffffff',
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

export function drawMap(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  groups: PositionGroup[],
  stops: Stop[],
  lines: DisplayedLine[],
  layers: LayerVisibility,
  zoom: number,
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

  if (layers.lines) {
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2.5 / zoom
    for (const line of lines) {
      if (line.entries.length < 2) continue
      context.beginPath()
      context.strokeStyle = lineColor(line.color_index)
      context.moveTo(line.entries[0].position.x, line.entries[0].position.y)
      for (const entry of line.entries.slice(1)) {
        context.lineTo(entry.position.x, entry.position.y)
      }
      context.stroke()
    }
  }

  if (layers.stops) {
    const stopRadius = 4.5 / zoom
    for (const stop of stops) {
      const isBusy = stop.passenger_capacity > 0
        && stop.passenger_waiting / stop.passenger_capacity >= 0.8
      context.fillStyle = isBusy ? COLORS.stopBusy : COLORS.stop
      context.strokeStyle = COLORS.stopBorder
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
