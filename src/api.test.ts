import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCompanies, fetchLineSchedule, fetchPositions, loadViewerSnapshot, refreshPositions } from './api'

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
const stops = {
  api_version: 'v1', world_epoch: 2, sync_step: 1, snapshot_sequence: 4, generated_at_ms: 4,
  stops: [{
    id: 101, name: '中央駅', owner_company_id: 5, allowed_company_ids: [5], position: { x: 900, y: 600, z: 2 },
    passenger_waiting: 120, passenger_capacity: 500,
    arrived_last_month: 3200, departed_last_month: 3100,
  }],
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
      .mockResolvedValueOnce(response(JSON.stringify(companies)))
      .mockResolvedValueOnce(response(JSON.stringify(lines)))
      .mockResolvedValueOnce(response(JSON.stringify(schedule3)))
      .mockResolvedValueOnce(response(JSON.stringify(schedule4)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadViewerSnapshot()
    expect(loaded.map.size).toEqual({ width: 1500, height: 1000 })
    expect(loaded.convoys[0]).toMatchObject({ convoy_id: 11, name: '11号', x: 910 })
    expect(loaded.stops[0]).toMatchObject({ id: 101, name: '中央駅' })
    expect(loaded.companies[0]).toMatchObject({ id: 5, primary_color_index: 40 })
    expect(loaded.lines).toHaveLength(2)
    expect(loaded.lines[0].entries.map((entry) => entry.index)).toEqual([0, 1])
    expect(loaded.lines[1].entries[1].stop_id).toBeNull()
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(requestedUrls.some((url) => url.endsWith('/convoys?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/convoy-positions?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/lines?waytype=all'))).toBe(true)
    expect(requestedUrls.some((url) => url.endsWith('/companies'))).toBe(true)
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
      } }))
      .mockResolvedValueOnce(response(JSON.stringify({ ...stops, world_epoch: 3 })))
      .mockResolvedValueOnce(response(JSON.stringify({ ...companies, world_epoch: 3 }))))
    await expect(refreshPositions(2, list.convoys)).resolves.toEqual({ epochChanged: true })
  })

  it('会社一覧を取得し、位置更新時の会社色変更を返す', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(companies))))
    await expect(fetchCompanies()).resolves.toEqual(companies)

    const changedCompanies = {
      ...companies,
      companies: [{ ...companies.companies[0], primary_color_index: 48 }],
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(map)))
      .mockResolvedValueOnce(response(csv, { headers: {
        'X-Simutrans-World-Epoch': '2', 'X-Simutrans-Snapshot-Sequence': '4',
      } }))
      .mockResolvedValueOnce(response(JSON.stringify(stops)))
      .mockResolvedValueOnce(response(JSON.stringify(changedCompanies))))
    const refreshed = await refreshPositions(2, list.convoys)
    expect(refreshed).toMatchObject({
      epochChanged: false,
      companies: [{ id: 5, primary_color_index: 48 }],
    })
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
      if (url.endsWith('/companies')) return Promise.resolve(response(JSON.stringify(companies)))
      if (url.includes('/lines?')) return Promise.resolve(response(JSON.stringify({ ...lines, lines: [lines.lines[0]] })))
      return Promise.resolve(response(JSON.stringify({ ...schedule3, world_epoch: 3 })))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadViewerSnapshot()).rejects.toThrow('マップ切替中')
    expect(fetchMock).toHaveBeenCalledTimes(28)
  })
})
