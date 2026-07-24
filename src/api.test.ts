import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCompanies, fetchLineSchedule, fetchPositions, fetchRoadSigns, fetchStopTiles, fetchWayTopology, loadViewerSnapshot, refreshPositions } from './api'
import type { RoadSignList, ViewerSnapshot } from './types'

const map = {
  api_version: 'v1' as const, world_epoch: 2, sync_step: 1, snapshot_sequence: 1, generated_at_ms: 1,
  size: { width: 1500, height: 1000 },
  time: { year: 1963, month: 7, diagram_time: '03:55:00', paused: false, time_multiplier: 16 },
}
const list = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 2, generated_at_ms: 2,
  carunits_per_tile: 16,
  convoys: [{ id: 11, name: '11号', company_id: 5, line_id: 3, waytype: 'track', vehicle_count: 4, length_carunits: 32 }],
}
const csv = 'convoy_id,waytype,state,state_code,speed_kmh,x,y,z,route_index\n11,track,driving,6,120,910,613,2,15'
const topologyCsv = 'x,y,z,waytype,physical_ribi,blocked_ribi,north_z,east_z,south_z,west_z\n910,613,2,track,6,0,,2,2,'
const topologyHeaders = { 'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '8' }
const roadSigns: RoadSignList = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 9, generated_at_ms: 9,
  road_signs: [{
    position: { x: 910, y: 613, z: 2 }, waytype: 'track', kind: 'signal',
    directions: ['east'], state: 'red', company_id: 5, descriptor_name: 'rail-signal',
  }],
}
const stops = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 4, generated_at_ms: 4,
  stops: [{
    id: 101, name: '中央駅', owner_company_id: 5, allowed_company_ids: [5], position: { x: 900, y: 600, z: 2 },
    passenger_waiting: 120, passenger_capacity: 500,
    arrived_last_month: 3200, departed_last_month: 3100,
  }],
}
const stopTiles = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 4, generated_at_ms: 4,
  stops: [{ stop_id: 101, tiles: [{ x: 899, y: 600, z: 2 }, { x: 900, y: 600, z: 2 }] }],
}
const companies = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 5, generated_at_ms: 5,
  companies: [{
    id: 5, name: '常陸交通', current_cash: 100_000, public_service: false,
    ai_type: 'human', ai_active: false, locked: false,
    primary_color_index: 40, secondary_color_index: 64,
  }],
}
const lines = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 6, generated_at_ms: 6,
  lines: [
    { id: 3, name: '中央線', company_id: 5, waytype: 'track', convoy_count: 1, withdraw: false, color_index: 44 },
    { id: 4, name: 'バス路線', company_id: 5, waytype: 'road', convoy_count: 1, withdraw: false, color_index: 36 },
  ],
}
const schedule3 = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 6, generated_at_ms: 6,
  line_id: 3,
  entries: [
    { index: 1, position: { x: 900, y: 600, z: 2 }, stop_id: 101 },
    { index: 0, position: { x: 850, y: 550, z: 2 }, stop_id: 100 },
  ],
}
const schedule4 = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 7, generated_at_ms: 7,
  line_id: 4,
  entries: [
    { index: 0, position: { x: 700, y: 500, z: 1 }, stop_id: 90 },
    { index: 1, position: { x: 750, y: 520, z: 1 }, stop_id: null },
  ],
}
const viewerSnapshot: ViewerSnapshot = {
  map,
  time: map.time,
  convoyMetadata: list.convoys,
  convoys: [],
  stops: stops.stops,
  stopTiles: [{ stop_id: 101, x: 899, y: 600, z: 2 }, { stop_id: 101, x: 900, y: 600, z: 2 }],
  companies: companies.companies,
  lines: [{ ...lines.lines[0], entries: schedule3.entries }],
  wayTopology: [],
  roadSigns: roadSigns.road_signs,
}

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init)
}

afterEach(() => vi.restoreAllMocks())

describe('Simutrans API client', () => {
  it('編成・駅・複数路線を一つの表示スナップショットにする', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(map)))
      .mockResolvedValueOnce(response(JSON.stringify(list)))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '3',
      } }))
      .mockResolvedValueOnce(response(JSON.stringify(stops)))
      .mockResolvedValueOnce(response(JSON.stringify(stopTiles)))
      .mockResolvedValueOnce(response(JSON.stringify(companies)))
      .mockResolvedValueOnce(response(JSON.stringify(lines)))
      .mockResolvedValueOnce(response(topologyCsv, { headers: topologyHeaders }))
      .mockResolvedValueOnce(response(JSON.stringify(roadSigns)))
      .mockResolvedValueOnce(response(JSON.stringify(schedule3)))
      .mockResolvedValueOnce(response(JSON.stringify(schedule4)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadViewerSnapshot()
    expect(loaded.map.size).toEqual({ width: 1500, height: 1000 })
    expect(loaded.convoys[0]).toMatchObject({ convoy_id: 11, name: '11号', x: 910 })
    expect(loaded.stops[0]).toMatchObject({ id: 101, name: '中央駅' })
    expect(loaded.stopTiles).toContainEqual({ stop_id: 101, x: 899, y: 600, z: 2 })
    expect(loaded.companies[0]).toMatchObject({ id: 5, primary_color_index: 40 })
    expect(loaded.lines).toHaveLength(2)
    expect(loaded.wayTopology[0]).toMatchObject({ x: 910, physical_ribi: 6, waytype: 'track' })
    expect(loaded.roadSigns[0]).toMatchObject({ kind: 'signal', state: 'red' })
    expect(loaded.lines[0].entries.map((entry) => entry.index)).toEqual([0, 1])
    expect(loaded.lines[1].entries[1].stop_id).toBeNull()
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(requestedUrls.some((url) => url.endsWith('/convoys?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/convoy-positions?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/lines?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/companies'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/stop-tiles'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/way-topology?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/road-signs'))).toBe(true)
  })

  it('交通路トポロジーCSVとepochヘッダーを取得する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(topologyCsv, { headers: topologyHeaders })))
    await expect(fetchWayTopology()).resolves.toMatchObject({
      worldEpoch: 2,
      tiles: [{ x: 910, y: 613, physical_ribi: 6, east_z: 2, north_z: null }],
    })
  })

  it('駅タイル一覧を取得する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(JSON.stringify(stopTiles))))
    await expect(fetchStopTiles()).resolves.toEqual(stopTiles)
  })

  it('信号機一覧を取得し、503を利用者向けエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(JSON.stringify(roadSigns))))
    await expect(fetchRoadSigns()).resolves.toEqual(roadSigns)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"error":"No world"}', {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(fetchRoadSigns()).rejects.toThrow('503')
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
      .mockResolvedValueOnce(response(JSON.stringify({ ...list, world_epoch: 3 })))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '3', 'X-Simutrans-Snapshot-Sequence': '4',
      } }))
      .mockResolvedValueOnce(response(JSON.stringify({ ...roadSigns, world_epoch: 3 }))))
    await expect(refreshPositions(viewerSnapshot)).resolves.toEqual({ epochChanged: true })
  })

  it('会社一覧は個別取得でき、通常更新では会社・駅を再取得しない', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(companies))))
    await expect(fetchCompanies()).resolves.toEqual(companies)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(map)))
      .mockResolvedValueOnce(response(JSON.stringify(list)))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '4',
      } }))
      .mockResolvedValueOnce(response(JSON.stringify(roadSigns)))
    vi.stubGlobal('fetch', fetchMock)
    const refreshed = await refreshPositions(viewerSnapshot)
    expect(refreshed).toMatchObject({
      epochChanged: false,
      convoyMetadata: [{ id: 11 }],
      stops: stops.stops,
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('未知の路線と駅だけを通常更新時に補完する', async () => {
    const convoyListWithNewLine = {
      ...list,
      convoys: [...list.convoys, { ...list.convoys[0], id: 12, line_id: 4, name: '12号' }],
    }
    const stopsWithNewStop = {
      ...stops,
      stops: [...stops.stops, { ...stops.stops[0], id: 90, name: '新駅' }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(map)))
      .mockResolvedValueOnce(response(JSON.stringify(convoyListWithNewLine)))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '4',
      } }))
      .mockResolvedValueOnce(response(JSON.stringify(roadSigns)))
      .mockResolvedValueOnce(response(JSON.stringify(lines)))
      .mockResolvedValueOnce(response(JSON.stringify(schedule4)))
      .mockResolvedValueOnce(response(JSON.stringify(stopsWithNewStop)))
      .mockResolvedValueOnce(response(JSON.stringify(stopTiles)))
    vi.stubGlobal('fetch', fetchMock)
    const refreshed = await refreshPositions(viewerSnapshot)
    expect(refreshed).toMatchObject({
      epochChanged: false,
      lines: [{ id: 3 }, { id: 4 }],
      stops: [{ id: 101 }, { id: 90 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('接続不能を利用者向けエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(fetchPositions()).rejects.toThrow('接続できません')
  })

  it('schedule取得失敗を利用者向けエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"error":"Line unavailable"}', {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(fetchLineSchedule(3)).rejects.toThrow('503')
  })

  it('scheduleのepochが一致しなければ全体取得を再試行する', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/map-info')) return Promise.resolve(response(JSON.stringify(map)))
      if (url.includes('/convoys?')) return Promise.resolve(response(JSON.stringify(list)))
      if (url.includes('/convoy-positions?')) return Promise.resolve(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '3',
      } }))
      if (url.endsWith('/stops')) return Promise.resolve(response(JSON.stringify(stops)))
      if (url.endsWith('/stop-tiles')) return Promise.resolve(response(JSON.stringify(stopTiles)))
      if (url.endsWith('/companies')) return Promise.resolve(response(JSON.stringify(companies)))
      if (url.includes('/lines?')) return Promise.resolve(response(JSON.stringify({ ...lines, lines: [lines.lines[0]] })))
      if (url.includes('/way-topology?')) return Promise.resolve(response(topologyCsv, { headers: topologyHeaders }))
      if (url.endsWith('/road-signs')) return Promise.resolve(response(JSON.stringify(roadSigns)))
      return Promise.resolve(response(JSON.stringify({ ...schedule3, world_epoch: 3 })))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadViewerSnapshot()).rejects.toThrow('マップ切替中')
    expect(fetchMock).toHaveBeenCalledTimes(40)
  })
})
