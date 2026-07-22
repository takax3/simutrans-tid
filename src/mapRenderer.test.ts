import { describe, expect, it } from 'vitest'
import { calculateBackingScale, drawMap, lineColor } from './mapRenderer'
import type { DisplayedLine, PositionGroup, Stop } from './types'

describe('calculateBackingScale', () => {
  it('ズーム率と端末の画素密度を内部解像度へ反映する', () => {
    expect(calculateBackingScale(1500, 1000, 1, 1)).toBe(1)
    expect(calculateBackingScale(1500, 1000, 1.25, 1)).toBe(1.25)
    expect(calculateBackingScale(1500, 1000, 1, 2)).toBe(2)
  })

  it('高倍率時はCanvasのメモリ使用量を安全な範囲に制限する', () => {
    const scale = calculateBackingScale(1500, 1000, 4, 2)
    expect(scale).toBeGreaterThanOrEqual(4)
    expect(1500 * scale).toBeLessThanOrEqual(8192)
    expect(1500 * 1000 * scale * scale).toBeLessThanOrEqual(32_000_000.01)
  })

  it('color_indexから安定した半透明色を生成する', () => {
    expect(lineColor(44)).toBe(lineColor(44))
    expect(lineColor(44)).not.toBe(lineColor(36))
    expect(lineColor(44)).toContain('/ 0.58')
  })

  it('概略路線を駅・編成より先に順序どおり描画し、レイヤーOFFなら省略する', () => {
    const operations: string[] = []
    const context = {
      setTransform: () => undefined,
      clearRect: () => undefined,
      fillRect: (x: number, y: number) => operations.push(`fillRect:${x},${y}`),
      strokeRect: () => undefined,
      beginPath: () => undefined,
      moveTo: (x: number, y: number) => operations.push(`moveTo:${x},${y}`),
      lineTo: (x: number, y: number) => operations.push(`lineTo:${x},${y}`),
      stroke: () => undefined,
      arc: (x: number, y: number) => operations.push(`arc:${x},${y}`),
      fill: () => undefined,
      fillText: () => undefined,
    }
    const canvas = {
      width: 0, height: 0, style: {},
      getContext: () => context,
    } as unknown as HTMLCanvasElement
    const lines: DisplayedLine[] = [{
      id: 3, name: '中央線', company_id: 5, waytype: 'track', convoy_count: 1,
      withdraw: false, color_index: 44,
      entries: [
        { index: 0, position: { x: 10, y: 20, z: 0 }, stop_id: 1 },
        { index: 1, position: { x: 30, y: 40, z: 0 }, stop_id: null },
      ],
    }]
    const stops: Stop[] = [{
      id: 1, name: '中央駅', company_ids: [5], position: { x: 50, y: 60, z: 0 },
      passenger_waiting: 0, passenger_capacity: 100,
      arrived_last_month: 0, departed_last_month: 0,
    }]
    const groups: PositionGroup[] = [{
      key: '70,80', x: 70, y: 80,
      convoys: [{
        convoy_id: 11, name: '11号', company_id: 5, line_id: 3, vehicle_count: 4,
        waytype: 'track', state: 'driving', state_code: 6, speed_kmh: 80,
        x: 70, y: 80, z: 0, route_index: 1,
      }],
    }]

    drawMap(canvas, 100, 100, groups, stops, lines, { lines: true, stops: true, convoys: true }, 1)
    const routeStart = operations.indexOf('moveTo:10,20')
    const routeEnd = operations.indexOf('lineTo:30,40')
    const stopMarker = operations.indexOf('fillRect:45.5,55.5')
    const convoyMarker = operations.indexOf('arc:70,80')
    expect(routeStart).toBeGreaterThanOrEqual(0)
    expect(routeStart).toBeLessThan(routeEnd)
    expect(routeEnd).toBeLessThan(stopMarker)
    expect(stopMarker).toBeLessThan(convoyMarker)

    operations.length = 0
    drawMap(canvas, 100, 100, groups, stops, lines, { lines: false, stops: true, convoys: true }, 1)
    expect(operations).not.toContain('moveTo:10,20')
  })
})
