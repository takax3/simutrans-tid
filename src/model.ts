import type { Convoy, ConvoyPosition, DisplayedConvoy, PositionGroup } from './types'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEP = 0.25

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
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
