import { describe, expect, it } from 'vitest'
import { parseConvoyPositions, parseCsv, parseWayTopology } from './csv'

describe('parseCsv', () => {
  it('CRLF、引用符、引用符内のカンマを解析する', () => {
    expect(parseCsv('a,b\r\n"x,y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'say "hi"'],
    ])
  })
})

describe('parseWayTopology', () => {
  it('ribiと空の隣接高度を型変換する', () => {
    const csv = [
      'x,y,z,waytype,physical_ribi,blocked_ribi,north_z,east_z,south_z,west_z',
      '10,20,2,track,6,0,,2,3,',
    ].join('\r\n')
    expect(parseWayTopology(csv)).toEqual([{
      x: 10, y: 20, z: 2, waytype: 'track', physical_ribi: 6, blocked_ribi: 0,
      north_z: null, east_z: 2, south_z: 3, west_z: null,
    }])
  })
})

describe('parseConvoyPositions', () => {
  it('ヘッダー名で位置を読み込み、空のroute_indexをnullにする', () => {
    const csv = [
      'x,convoy_id,state,waytype,state_code,speed_kmh,y,z,route_index',
      '910,11,driving,track,6,120,613,2,',
    ].join('\r\n')
    expect(parseConvoyPositions(csv)).toEqual([{
      convoy_id: 11,
      waytype: 'track',
      state: 'driving',
      state_code: 6,
      speed_kmh: 120,
      x: 910,
      y: 613,
      z: 2,
      route_index: null,
    }])
  })

  it('必須列がないCSVを拒否する', () => {
    expect(() => parseConvoyPositions('convoy_id,x,y\n1,2,3')).toThrow('waytype列')
  })
})
