import { describe, expect, it } from 'vitest'
import {
  alignLinesToStops, clampZoom, filterStopsForLines, findStopsAt, groupConvoysByPosition,
  joinConvoys, zoomByWheelDelta,
} from './model'
import type { ConvoyPosition, DisplayedConvoy, DisplayedLine, Stop } from './types'

const position: ConvoyPosition = {
  convoy_id: 11, waytype: 'track', state: 'driving', state_code: 6,
  speed_kmh: 120, x: 910, y: 613, z: 2, route_index: 15,
}

describe('viewer model', () => {
  it('編成メタデータと位置をIDで結合する', () => {
    const joined = joinConvoys([{
      id: 11, name: '急行11号', company_id: 5, line_id: 3,
      waytype: 'track', vehicle_count: 4, length_carunits: 32,
    }], [position])
    expect(joined[0]).toMatchObject({ name: '急行11号', line_id: 3, x: 910 })
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
