import { describe, expect, it } from 'vitest'
import { clampZoom, groupConvoysByPosition, joinConvoys } from './model'
import type { ConvoyPosition, DisplayedConvoy } from './types'

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
})
