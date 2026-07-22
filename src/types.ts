export interface MapTime {
  year: number
  month: number
  diagram_time: string
  paused: boolean
  time_multiplier: number
}

export interface MapInfo {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  time: MapTime
  size: { width: number; height: number }
}

export interface TimeSnapshot {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  time: MapTime
}

export interface Convoy {
  id: number
  name: string
  company_id: number | null
  line_id: number | null
  waytype: string
  vehicle_count: number
  length_carunits: number
}

export interface ConvoyList {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  carunits_per_tile: number
  convoys: Convoy[]
}

export interface ConvoyPosition {
  convoy_id: number
  waytype: string
  state: string
  state_code: number
  speed_kmh: number
  x: number
  y: number
  z: number
  route_index: number | null
}

export interface PositionsSnapshot {
  worldEpoch: number
  snapshotSequence: number
  positions: ConvoyPosition[]
}

export interface DisplayedConvoy extends ConvoyPosition {
  name: string
  company_id: number | null
  line_id: number | null
  vehicle_count: number | null
}

export interface ViewerSnapshot {
  map: MapInfo
  time: MapTime
  convoyMetadata: Convoy[]
  convoys: DisplayedConvoy[]
}

export interface PositionGroup {
  key: string
  x: number
  y: number
  convoys: DisplayedConvoy[]
}
