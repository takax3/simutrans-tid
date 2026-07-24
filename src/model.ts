import type {
  Convoy, ConvoyPosition, DisplayedConvoy, DisplayedLine, PositionGroup, Stop,
} from './types'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEP = 0.25
export const WHEEL_ZOOM_SENSITIVITY = 0.002

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function zoomByWheelDelta(currentZoom: number, deltaPixels: number): number {
  return clampZoom(currentZoom * Math.exp(-deltaPixels * WHEEL_ZOOM_SENSITIVITY))
}

export function joinConvoys(
  metadata: Convoy[],
  positions: ConvoyPosition[],
): DisplayedConvoy[] {
  const byId = new Map(metadata.map((convoy) => [convoy.id, convoy]))
  return positions.map((position) => {
    const convoy = byId.get(position.convoy_id)
    return {
      ...position,
      name: convoy?.name ?? `編成 ${position.convoy_id}`,
      company_id: convoy?.company_id ?? null,
      line_id: convoy?.line_id ?? null,
      vehicle_count: convoy?.vehicle_count ?? null,
    }
  })
}

export function groupConvoysByPosition(convoys: DisplayedConvoy[]): PositionGroup[] {
  const groups = new Map<string, PositionGroup>()
  for (const convoy of convoys) {
    const key = `${convoy.x}:${convoy.y}`
    const group = groups.get(key)
    if (group) group.convoys.push(convoy)
    else groups.set(key, { key, x: convoy.x, y: convoy.y, convoys: [convoy] })
  }
  return [...groups.values()]
}

export function findGroupAt(
  groups: PositionGroup[],
  x: number,
  y: number,
  radius: number,
): PositionGroup | null {
  let nearest: PositionGroup | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const group of groups) {
    const distance = Math.hypot(group.x - x, group.y - y)
    if (distance <= radius && distance < nearestDistance) {
      nearest = group
      nearestDistance = distance
    }
  }
  return nearest
}

export function findStopsAt(
  stops: Stop[],
  x: number,
  y: number,
  radius: number,
): Stop[] {
  return stops
    .map((stop) => ({
      stop,
      distance: Math.hypot(stop.position.x - x, stop.position.y - y),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .map(({ stop }) => stop)
}

export function filterStopsForLines(stops: Stop[], lines: DisplayedLine[]): Stop[] {
  const stopIds = new Set<number>()
  for (const line of lines) {
    for (const entry of line.entries) {
      if (entry.stop_id !== null) stopIds.add(entry.stop_id)
    }
  }
  return stops.filter((stop) => stopIds.has(stop.id))
}

export function alignLinesToStops(lines: DisplayedLine[], stops: Stop[]): DisplayedLine[] {
  const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
  return lines.map((line) => ({
    ...line,
    entries: line.entries.map((entry) => {
      if (entry.stop_id === null) return entry
      const stop = stopsById.get(entry.stop_id)
      return stop ? { ...entry, position: { ...stop.position } } : entry
    }),
  }))
}
