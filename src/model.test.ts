import { describe, expect, it } from 'vitest'
import {
  alignLinesToStops, clampZoom, connectedWayTopology, filterConvoysForWayTopology, filterRoadSigns,
  filterStopsForLines, findStopsAt, findWayTopologyAt, findWayTopologyCandidatesAt,
  groupConvoysByPosition, joinConvoys, stopTilesOnWayTopology, topologyAfterCuts,
  visibleStopTiles, wayTopologyKey, zoomByWheelDelta,
} from './model'
import type { ConvoyPosition, DisplayedConvoy, DisplayedLine, RoadSign, Stop, WayTopologyTile } from './types'

const position: ConvoyPosition = {
  convoy_id: 11, waytype: 'track', state: 'driving', state_code: 6,
  speed_kmh: 120, x: 910, y: 613, z: 2, route_index: 15,
}

describe('viewer model', () => {
  const topologyTile = (
    x: number, y: number, z: number, physical_ribi: number,
    overrides: Partial<WayTopologyTile> = {},
  ): WayTopologyTile => ({
    x, y, z, physical_ribi, waytype: 'track', blocked_ribi: 0,
    north_z: null, east_z: null, south_z: null, west_z: null,
    ...overrides,
  })

  it('編成メタデータと位置をIDで結合する', () => {
    const joined = joinConvoys([{
      id: 11, name: '急行11号', company_id: 5, line_id: 3,
      waytype: 'track', vehicle_count: 4, length_carunits: 32,
    }], [position])
    expect(joined[0]).toMatchObject({ name: '急行11号', line_id: 3, x: 910 })
  })

  it('表示対象駅のタイルだけを残し、同じ座標ではzが最大の駅を選ぶ', () => {
    const tiles = [
      { stop_id: 1, x: 10, y: 20, z: 1 },
      { stop_id: 2, x: 10, y: 20, z: 5 },
      { stop_id: 1, x: 11, y: 20, z: 1 },
      { stop_id: 3, x: 12, y: 20, z: 9 },
    ]
    expect(visibleStopTiles(tiles, new Set([1, 2]))).toEqual([
      { stop_id: 2, x: 10, y: 20, z: 5 },
      { stop_id: 1, x: 11, y: 20, z: 1 },
    ])
  })

  it('選択トポロジとx/y/zが一致する駅タイルだけを抽出する', () => {
    const topology = [topologyTile(10, 20, 5, 0), topologyTile(11, 20, 5, 0)]
    expect(stopTilesOnWayTopology([
      { stop_id: 1, x: 10, y: 20, z: 5 },
      { stop_id: 2, x: 10, y: 20, z: 1 },
      { stop_id: 3, x: 12, y: 20, z: 5 },
    ], topology)).toEqual([{ stop_id: 1, x: 10, y: 20, z: 5 }])
  })

  it('同じx,yの編成を一つの位置グループにまとめる', () => {
    const convoy = { ...position, name: 'A', company_id: 1, line_id: 1, vehicle_count: 4 } as DisplayedConvoy
    const groups = groupConvoysByPosition([convoy, { ...convoy, convoy_id: 12, z: 5 }])
    expect(groups).toHaveLength(1)
    expect(groups[0].convoys).toHaveLength(2)
  })

  it('ズームを25%から400%に制限する', () => {
    expect(clampZoom(0)).toBe(0.25)
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(9)).toBe(4)
  })

  it('ホイール量に応じて滑らかにズームし、上下限を超えない', () => {
    const zoomedIn = zoomByWheelDelta(1, -100)
    const zoomedOut = zoomByWheelDelta(1, 100)
    expect(zoomedIn).toBeGreaterThan(1)
    expect(zoomedIn).toBeLessThan(1.25)
    expect(zoomedOut).toBeLessThan(1)
    expect(zoomedOut).toBeGreaterThan(0.75)
    expect(zoomByWheelDelta(4, -10_000)).toBe(4)
    expect(zoomByWheelDelta(0.25, 10_000)).toBe(0.25)
  })

  it('方向と接続先Zが双方で一致する線路だけを連結する', () => {
    const tiles = [
      topologyTile(0, 0, 0, 2, { east_z: 1 }),
      topologyTile(1, 0, 1, 10, { west_z: 0, east_z: 1 }),
      topologyTile(2, 0, 1, 8, { west_z: 1 }),
      topologyTile(1, 0, 0, 8, { west_z: 0 }),
      topologyTile(2, 0, 1, 8, { waytype: 'tram', west_z: 1 }),
    ]
    expect(connectedWayTopology(tiles, tiles[0]).map(wayTopologyKey)).toEqual([
      'track:0:0:0', 'track:1:0:1', 'track:2:0:1',
    ])
  })

  it('分岐・環状・孤立タイルをそれぞれ正しい連結成分に分ける', () => {
    const tiles = [
      topologyTile(0, 0, 0, 6, { east_z: 0, south_z: 0 }),
      topologyTile(1, 0, 0, 12, { west_z: 0, south_z: 0 }),
      topologyTile(1, 1, 0, 9, { north_z: 0, west_z: 0 }),
      topologyTile(0, 1, 0, 3, { north_z: 0, east_z: 0 }),
      topologyTile(9, 9, 0, 0),
    ]
    expect(connectedWayTopology(tiles, tiles[0])).toHaveLength(4)
    expect(connectedWayTopology(tiles, tiles[4])).toEqual([tiles[4]])
  })

  it('切断タイルを除外し、起点から切り離されたトポロジも除外する', () => {
    const tiles = [
      topologyTile(0, 0, 0, 2, { east_z: 0 }),
      topologyTile(1, 0, 0, 10, { west_z: 0, east_z: 0 }),
      topologyTile(2, 0, 0, 10, { west_z: 0, east_z: 0 }),
      topologyTile(3, 0, 0, 8, { west_z: 0 }),
    ]
    expect(topologyAfterCuts(tiles, tiles[0], new Set([wayTopologyKey(tiles[2])]))).toEqual(tiles.slice(0, 2))
    expect(topologyAfterCuts(tiles, tiles[0], new Set()).map(wayTopologyKey)).toHaveLength(4)
    expect(topologyAfterCuts(tiles, tiles[0], new Set([wayTopologyKey(tiles[0])]))).toEqual([])
  })

  it('最寄り線路を交通種別優先順、次に低いZ順で選ぶ', () => {
    const tiles = [
      topologyTile(10, 10, 3, 0),
      topologyTile(10, 10, 1, 0),
      topologyTile(10, 10, 0, 0, { waytype: 'tram' }),
    ]
    expect(findWayTopologyAt(tiles, 10, 10, 2, ['tram', 'track'])?.waytype).toBe('tram')
    expect(findWayTopologyAt(tiles.slice(0, 2), 10, 10, 2, ['track'])?.z).toBe(1)
    expect(findWayTopologyAt(tiles, 30, 30, 2, ['track'])).toBeNull()
  })

  it('最寄りxyに重なる全トポロジを候補として返す', () => {
    const tiles = [
      topologyTile(10, 10, 3, 0),
      topologyTile(10, 10, 1, 0),
      topologyTile(11, 10, 0, 0),
    ]
    expect(findWayTopologyCandidatesAt(tiles, 10, 10, 2, ['track']).map((tile) => tile.z)).toEqual([1, 3])
  })

  it('選択線路とwaytype・x・y・zが一致する編成だけを抽出する', () => {
    const convoy = { ...position, name: 'A', company_id: 1, line_id: 1, vehicle_count: 4 } as DisplayedConvoy
    const keys = new Set(['track:910:613:2'])
    expect(filterConvoysForWayTopology([
      convoy,
      { ...convoy, convoy_id: 12, z: 3 },
      { ...convoy, convoy_id: 13, waytype: 'tram' },
    ], keys).map((item) => item.convoy_id)).toEqual([11])
  })

  it('状態があり、表示線路とx/y/zが一致する信号だけをwaytypeに関係なく抽出する', () => {
    const base: RoadSign = {
      position: { x: 10, y: 20, z: 2 }, waytype: 'track', kind: 'signal',
      directions: ['east'], state: 'red', company_id: 1, descriptor_name: 'signal',
    }
    const signs: RoadSign[] = [
      { ...base, directions: [...base.directions] },
      { ...base, position: { x: 11, y: 20, z: 2 }, state: null },
      { ...base, position: { x: 12, y: 20, z: 2 }, waytype: 'track', directions: [...base.directions] },
      { ...base, position: { x: 10, y: 20, z: 3 }, directions: [...base.directions] },
    ]
    const visibleTramTile = topologyTile(10, 20, 2, 0, { waytype: 'tram' })
    expect(filterRoadSigns(signs, [visibleTramTile])).toEqual([signs[0]])
    expect(filterRoadSigns(signs, [topologyTile(10, 20, 3, 0)])).toEqual([signs[3]])
    expect(filterRoadSigns(signs, [topologyTile(99, 99, 0, 0)])).toEqual([])
  })

  it('指定座標に近い駅を距離順で返す', () => {
    const stops = [
      { id: 1, name: 'A', owner_company_id: 1, allowed_company_ids: [1], position: { x: 10, y: 10, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
      { id: 2, name: 'B', owner_company_id: 1, allowed_company_ids: [1], position: { x: 13, y: 10, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
      { id: 3, name: 'C', owner_company_id: 1, allowed_company_ids: [1], position: { x: 30, y: 30, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
    ]
    expect(findStopsAt(stops, 11, 10, 5).map((stop) => stop.id)).toEqual([1, 2])
  })

  it('選択中路線のscheduleに含まれる駅だけを重複なく抽出する', () => {
    const stops: Stop[] = [
      { id: 1, name: '鉄道駅', owner_company_id: 1, allowed_company_ids: [1], position: { x: 10, y: 10, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
      { id: 2, name: '共用駅', owner_company_id: 1, allowed_company_ids: [1], position: { x: 20, y: 20, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
      { id: 3, name: 'バス停', owner_company_id: 1, allowed_company_ids: [1], position: { x: 30, y: 30, z: 0 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
    ]
    const lines: DisplayedLine[] = [{
      id: 1, name: '鉄道路線', company_id: 1, waytype: 'track', convoy_count: 1,
      withdraw: false, color_index: 1,
      entries: [
        { index: 0, position: { x: 10, y: 10, z: 0 }, stop_id: 1 },
        { index: 1, position: { x: 15, y: 15, z: 0 }, stop_id: null },
        { index: 2, position: { x: 20, y: 20, z: 0 }, stop_id: 2 },
        { index: 3, position: { x: 20, y: 20, z: 0 }, stop_id: 2 },
      ],
    }]
    expect(filterStopsForLines(stops, lines).map((stop) => stop.id)).toEqual([1, 2])
  })

  it('停車駅の路線座標だけを駅APIの位置へ合わせる', () => {
    const stops: Stop[] = [
      { id: 1, name: '中央駅', owner_company_id: 1, allowed_company_ids: [1], position: { x: 100, y: 200, z: 3 }, passenger_waiting: 0, passenger_capacity: 0, arrived_last_month: 0, departed_last_month: 0 },
    ]
    const lines: DisplayedLine[] = [{
      id: 1, name: '中央線', company_id: 1, waytype: 'track', convoy_count: 1,
      withdraw: false, color_index: 1,
      entries: [
        { index: 0, position: { x: 90, y: 190, z: 2 }, stop_id: 1 },
        { index: 1, position: { x: 95, y: 195, z: 2 }, stop_id: null },
        { index: 2, position: { x: 110, y: 210, z: 2 }, stop_id: 999 },
      ],
    }]
    const aligned = alignLinesToStops(lines, stops)
    expect(aligned[0].entries[0].position).toEqual({ x: 100, y: 200, z: 3 })
    expect(aligned[0].entries[1].position).toEqual({ x: 95, y: 195, z: 2 })
    expect(aligned[0].entries[2].position).toEqual({ x: 110, y: 210, z: 2 })
    expect(lines[0].entries[0].position).toEqual({ x: 90, y: 190, z: 2 })
  })
})
