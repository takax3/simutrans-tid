import { describe, expect, it } from 'vitest'
import { calculateBackingScale, companyLineColor, drawMap, lineColor } from './mapRenderer'
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

  it('会社のプライマリー色から半透明の路線色を生成する', () => {
    expect(companyLineColor({
      id: 5, name: '会社5', current_cash: 0, public_service: false,
      ai_type: 'human', ai_active: false, locked: false,
      primary_color_index: 40, secondary_color_index: 64,
    })).toBe('#3F7A1694')
    expect(companyLineColor(undefined)).toBeNull()
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
      id: 1, name: '中央駅', owner_company_id: 5, allowed_company_ids: [5], position: { x: 50, y: 60, z: 0 },
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

    const companies = [{
      id: 5, name: '会社5', current_cash: 0, public_service: false,
      ai_type: 'human', ai_active: false, locked: false,
      primary_color_index: 40, secondary_color_index: 64,
    }]
    drawMap(canvas, 100, 100, groups, stops, companies, lines, { lines: true, stops: true, convoys: true }, true, 1)
    const routeStart = operations.indexOf('moveTo:10,20')
    const routeEnd = operations.indexOf('lineTo:30,40')
    const stopMarker = operations.indexOf('fillRect:45.5,55.5')
    const convoyMarker = operations.indexOf('arc:70,80')
    expect(routeStart).toBeGreaterThanOrEqual(0)
    expect(routeStart).toBeLessThan(routeEnd)
    expect(routeEnd).toBeLessThan(stopMarker)
    expect(stopMarker).toBeLessThan(convoyMarker)

    operations.length = 0
    drawMap(canvas, 100, 100, groups, stops, companies, lines, { lines: false, stops: true, convoys: true }, true, 1)
    expect(operations).not.toContain('moveTo:10,20')
  })

  it('駅を所有会社色で塗り、混雑時だけ外枠をオレンジにする', () => {
    const markers: Array<{ x: number; fill: string; stroke: string }> = []
    const context = {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      setTransform: () => undefined,
      clearRect: () => undefined,
      fillRect(x: number) {
        if (x > 0) markers.push({ x, fill: this.fillStyle, stroke: this.strokeStyle })
      },
      strokeRect: () => undefined,
      beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
      stroke: () => undefined, arc: () => undefined, fill: () => undefined,
      fillText: () => undefined,
    }
    const canvas = {
      width: 0, height: 0, style: {}, getContext: () => context,
    } as unknown as HTMLCanvasElement
    const baseStop = {
      name: '駅', owner_company_id: 5, allowed_company_ids: [5],
      position: { x: 10, y: 10, z: 0 }, passenger_waiting: 0,
      passenger_capacity: 100, arrived_last_month: 0, departed_last_month: 0,
    }
    const stops: Stop[] = [
      { ...baseStop, id: 1 },
      { ...baseStop, id: 2, position: { x: 20, y: 10, z: 0 }, passenger_waiting: 80 },
      { ...baseStop, id: 3, owner_company_id: null, position: { x: 30, y: 10, z: 0 } },
    ]
    const companies = [{
      id: 5, name: '会社5', current_cash: 0, public_service: false,
      ai_type: 'human', ai_active: false, locked: false,
      primary_color_index: 40, secondary_color_index: 64,
    }]

    drawMap(canvas, 100, 100, [], stops, companies, [], { lines: false, stops: true, convoys: false }, true, 1)

    expect(markers).toEqual([
      { x: 5.5, fill: '#3F7A16', stroke: '#ffffff' },
      { x: 15.5, fill: '#3F7A16', stroke: '#c95c2c' },
      { x: 25.5, fill: '#263b50', stroke: '#ffffff' },
    ])
  })
})
