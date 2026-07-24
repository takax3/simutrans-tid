import { wayTopologyKey } from './model'
import type { WayTopologyTile } from './types'

export const SAVED_TOPOLOGY_STORAGE_KEY = 'simutrans-tid.saved-topologies.v1'
export const SAVED_TOPOLOGY_VERSION = 1 as const

export interface SavedTopologyPoint {
  waytype: string
  x: number
  y: number
  z: number
}

export interface SavedTopologySelection {
  version: typeof SAVED_TOPOLOGY_VERSION
  id: string
  name: string
  createdAt: string
  updatedAt: string
  mapSize: { width: number; height: number }
  seed: SavedTopologyPoint
  cuts: SavedTopologyPoint[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parsePoint(value: unknown): SavedTopologyPoint | null {
  if (!isRecord(value) || typeof value.waytype !== 'string' || value.waytype.length === 0) return null
  if (![value.x, value.y, value.z].every((number) => typeof number === 'number' && Number.isFinite(number))) return null
  return { waytype: value.waytype, x: value.x as number, y: value.y as number, z: value.z as number }
}

export function parseSavedTopology(value: unknown): SavedTopologySelection {
  if (!isRecord(value) || value.version !== SAVED_TOPOLOGY_VERSION) {
    throw new Error('未対応または不正な保存データです。')
  }
  const seed = parsePoint(value.seed)
  const mapSize = isRecord(value.mapSize) ? value.mapSize : null
  if (
    typeof value.id !== 'string' || typeof value.name !== 'string' || value.name.trim() === ''
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !seed
    || !mapSize || typeof mapSize.width !== 'number' || typeof mapSize.height !== 'number'
    || !Array.isArray(value.cuts)
  ) throw new Error('保存データの必須項目が不正です。')
  const cuts = value.cuts.map(parsePoint)
  if (cuts.some((cut) => cut === null)) throw new Error('切断位置の形式が不正です。')
  return {
    version: SAVED_TOPOLOGY_VERSION,
    id: value.id,
    name: value.name.trim(),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    mapSize: { width: mapSize.width, height: mapSize.height },
    seed,
    cuts: cuts as SavedTopologyPoint[],
  }
}

export function loadSavedTopologies(storage: Storage = localStorage): SavedTopologySelection[] {
  try {
    const raw = storage.getItem(SAVED_TOPOLOGY_STORAGE_KEY)
    if (!raw) return []
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) return []
    return values.flatMap((value) => {
      try { return [parseSavedTopology(value)] } catch { return [] }
    })
  } catch {
    return []
  }
}

export function storeSavedTopologies(items: SavedTopologySelection[], storage: Storage = localStorage): void {
  storage.setItem(SAVED_TOPOLOGY_STORAGE_KEY, JSON.stringify(items))
}

export function createSavedTopology(
  name: string,
  seed: WayTopologyTile,
  cuts: WayTopologyTile[],
  mapSize: { width: number; height: number },
  existing?: SavedTopologySelection,
  now = new Date(),
): SavedTopologySelection {
  const timestamp = now.toISOString()
  const point = ({ waytype, x, y, z }: WayTopologyTile): SavedTopologyPoint => ({ waytype, x, y, z })
  return {
    version: SAVED_TOPOLOGY_VERSION,
    id: existing?.id ?? `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    mapSize: { ...mapSize },
    seed: point(seed),
    cuts: cuts.map(point),
  }
}

export function resolveSavedTopology(saved: SavedTopologySelection, tiles: WayTopologyTile[]): {
  seed: WayTopologyTile | null
  cuts: WayTopologyTile[]
  missingCuts: number
} {
  const byKey = new Map(tiles.map((tile) => [wayTopologyKey(tile), tile]))
  const seed = byKey.get(wayTopologyKey(saved.seed)) ?? null
  const cuts = saved.cuts.flatMap((point) => {
    const tile = byKey.get(wayTopologyKey(point))
    return tile ? [tile] : []
  })
  return { seed, cuts, missingCuts: saved.cuts.length - cuts.length }
}

export function topologyExportFilename(name: string): string {
  const safeName = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'selection'
  return `simutrans-tid-topology-${safeName}.json`
}
