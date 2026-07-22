import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPositions, loadViewerSnapshot, refreshPositions } from './api'

const map = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 1, generated_at_ms: 1,
  size: { width: 1500, height: 1000 },
  time: { year: 1963, month: 7, diagram_time: '03:55:00', paused: false, time_multiplier: 16 },
}
const list = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 2, generated_at_ms: 2,
  carunits_per_tile: 16,
  convoys: [{ id: 11, name: '11号', company_id: 5, line_id: 3, waytype: 'track', vehicle_count: 4, length_carunits: 32 }],
}
const csv = 'convoy_id,waytype,state,state_code,speed_kmh,x,y,z,route_index\n11,track,driving,6,120,910,613,2,15'

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init)
}

afterEach(() => vi.restoreAllMocks())

describe('Simutrans API client', () => {
  it('正常な3レスポンスを一つの表示スナップショットにする', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(map)))
      .mockResolvedValueOnce(response(JSON.stringify(list)))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '3',
      } })))
    const loaded = await loadViewerSnapshot()
    expect(loaded.map.size).toEqual({ width: 1500, height: 1000 })
    expect(loaded.convoys[0]).toMatchObject({ convoy_id: 11, name: '11号', x: 910 })
  })

  it('503を利用者向けエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"error":"No world"}', {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(fetchPositions()).rejects.toThrow('503')
  })

  it('位置更新でepoch変更を通知する', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify({ ...map, world_epoch: 3 })))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '3', 'X-Simutrans-Snapshot-Sequence': '4',
      } })))
    await expect(refreshPositions(2, list.convoys)).resolves.toEqual({ epochChanged: true })
  })

  it('接続不能を利用者向けエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(fetchPositions()).rejects.toThrow('接続できません')
  })
})
