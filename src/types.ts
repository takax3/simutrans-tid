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

export interface Stop {
  id: number
  name: string
  owner_company_id: number | null
  allowed_company_ids: number[]
  position: { x: number; y: number; z: number }
  passenger_waiting: number
  passenger_capacity: number
  arrived_last_month: number
  departed_last_month: number
}

export interface Company {
  id: number
  name: string
  current_cash: number
  public_service: boolean
  ai_type: string
  ai_active: boolean
  locked: boolean
  primary_color_index: number
  secondary_color_index: number
}

export interface CompanyList {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  companies: Company[]
}

export interface StopList {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  stops: Stop[]
}

export interface Line {
  id: number
  name: string
  company_id: number
  waytype: string
  convoy_count: number
  withdraw: boolean
  color_index: number
}

export interface LineList {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  lines: Line[]
}

export interface LineScheduleEntry {
  index: number
  position: { x: number; y: number; z: number }
  stop_id: number | null
}

export interface LineSchedule {
  api_version: 'v1'
  world_epoch: number
  sync_step: number
  snapshot_sequence: number
  generated_at_ms: number
  line_id: number
  entries: LineScheduleEntry[]
}

export interface DisplayedLine extends Line {
  entries: LineScheduleEntry[]
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

export interface WayTopologyTile {
  x: number
  y: number
  z: number
  waytype: string
  physical_ribi: number
  blocked_ribi: number
  north_z: number | null
  east_z: number | null
  south_z: number | null
  west_z: number | null
}

export interface WayTopologySnapshot {
  worldEpoch: number
  snapshotSequence: number
  tiles: WayTopologyTile[]
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
  stops: Stop[]
  companies: Company[]
  lines: DisplayedLine[]
  wayTopology: WayTopologyTile[]
}

export interface LayerVisibility {
  ways: boolean
  lines: boolean
  convoys: boolean
  stops: boolean
}

export interface PositionGroup {
  key: string
  x: number
  y: number
  convoys: DisplayedConvoy[]
}
