import type {
  Convoy, ConvoyPosition, DisplayedConvoy, DisplayedLine, PositionGroup, RoadSign, Stop, StopTile, WayTopologyTile,
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

export function wayTopologyKey(tile: Pick<WayTopologyTile, 'waytype' | 'x' | 'y' | 'z'>): string {
  return `${tile.waytype}:${tile.x}:${tile.y}:${tile.z}`
}

const topologyDirections = [
  { bit: 1, opposite: 4, dx: 0, dy: -1, zField: 'north_z' },
  { bit: 2, opposite: 8, dx: 1, dy: 0, zField: 'east_z' },
  { bit: 4, opposite: 1, dx: 0, dy: 1, zField: 'south_z' },
  { bit: 8, opposite: 2, dx: -1, dy: 0, zField: 'west_z' },
] as const

export function connectedWayTopology(
  tiles: WayTopologyTile[],
  seed: WayTopologyTile,
): WayTopologyTile[] {
  const byKey = new Map(tiles.map((tile) => [wayTopologyKey(tile), tile]))
  const seedTile = byKey.get(wayTopologyKey(seed))
  if (!seedTile) return []

  const connected: WayTopologyTile[] = []
  const visited = new Set<string>()
  const queue = [seedTile]
  while (queue.length > 0) {
    const tile = queue.shift()!
    const key = wayTopologyKey(tile)
    if (visited.has(key)) continue
    visited.add(key)
    connected.push(tile)

    for (const direction of topologyDirections) {
      if ((tile.physical_ribi & direction.bit) === 0) continue
      const neighborZ = tile[direction.zField]
      if (neighborZ === null) continue
      const neighbor = byKey.get(`${tile.waytype}:${tile.x + direction.dx}:${tile.y + direction.dy}:${neighborZ}`)
      if (neighbor && (neighbor.physical_ribi & direction.opposite) !== 0) queue.push(neighbor)
    }
  }
  return connected
}

export function topologyAfterCuts(
  tiles: WayTopologyTile[],
  seed: WayTopologyTile,
  cutKeys: ReadonlySet<string>,
): WayTopologyTile[] {
  if (cutKeys.has(wayTopologyKey(seed))) return []
  const remaining = tiles.filter((tile) => !cutKeys.has(wayTopologyKey(tile)))
  return connectedWayTopology(remaining, seed)
}

export function findWayTopologyCandidatesAt(
  tiles: WayTopologyTile[],
  x: number,
  y: number,
  radius: number,
  waytypeOrder: readonly string[],
): WayTopologyTile[] {
  const nearest = findWayTopologyAt(tiles, x, y, radius, waytypeOrder)
  if (!nearest) return []
  const priorities = new Map(waytypeOrder.map((waytype, index) => [waytype, index]))
  return tiles
    .filter((tile) => tile.x === nearest.x && tile.y === nearest.y)
    .sort((left, right) =>
      (priorities.get(left.waytype) ?? Number.MAX_SAFE_INTEGER) - (priorities.get(right.waytype) ?? Number.MAX_SAFE_INTEGER)
      || left.z - right.z)
}

export function findWayTopologyAt(
  tiles: WayTopologyTile[],
  x: number,
  y: number,
  radius: number,
  waytypeOrder: readonly string[],
): WayTopologyTile | null {
  const priorities = new Map(waytypeOrder.map((waytype, index) => [waytype, index]))
  return tiles
    .map((tile, index) => ({ tile, index, distance: Math.hypot(tile.x - x, tile.y - y) }))
    .filter(({ distance }) => distance <= radius)
    .sort((left, right) => left.distance - right.distance
      || (priorities.get(left.tile.waytype) ?? Number.MAX_SAFE_INTEGER) - (priorities.get(right.tile.waytype) ?? Number.MAX_SAFE_INTEGER)
      || left.tile.z - right.tile.z
      || left.index - right.index)[0]?.tile ?? null
}

export function filterConvoysForWayTopology(
  convoys: DisplayedConvoy[],
  topologyKeys: ReadonlySet<string>,
): DisplayedConvoy[] {
  return convoys.filter((convoy) => topologyKeys.has(wayTopologyKey(convoy)))
}

export function filterRoadSigns(
  roadSigns: RoadSign[],
  visibleTopology: WayTopologyTile[],
): RoadSign[] {
  const visibleCoordinates = new Set(visibleTopology.map((tile) => `${tile.x}:${tile.y}:${tile.z}`))
  return roadSigns.filter((sign) => sign.state !== null
    && visibleCoordinates.has(`${sign.position.x}:${sign.position.y}:${sign.position.z}`))
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

export function visibleStopTiles(stopTiles: StopTile[], visibleStopIds: Set<number>): StopTile[] {
  const highestByCoordinate = new Map<string, StopTile>()
  for (const tile of stopTiles) {
    if (!visibleStopIds.has(tile.stop_id)) continue
    const key = `${tile.x},${tile.y}`
    const current = highestByCoordinate.get(key)
    if (!current || tile.z > current.z) highestByCoordinate.set(key, tile)
  }
  return [...highestByCoordinate.values()]
}

export function stopTilesOnWayTopology(
  stopTiles: StopTile[],
  topology: WayTopologyTile[],
): StopTile[] {
  const topologyCoordinates = new Set(topology.map((tile) => `${tile.x},${tile.y},${tile.z}`))
  const matchingTiles = stopTiles.filter((tile) => (
    topologyCoordinates.has(`${tile.x},${tile.y},${tile.z}`)
  ))
  return visibleStopTiles(matchingTiles, new Set(matchingTiles.map((tile) => tile.stop_id)))
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
