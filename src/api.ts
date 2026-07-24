import { parseConvoyPositions, parseWayTopology } from './csv'
import { joinConvoys } from './model'
import type {
  CompanyList, ConvoyList, DisplayedLine, LineList, LineSchedule, MapInfo, PositionsSnapshot,
  StopList, TimeSnapshot, ViewerSnapshot, WayTopologySnapshot,
} from './types'

export const API_BASE_URL = 'http://127.0.0.1:13355'
const FETCH_TIMEOUT_MS = 5_000
const BOOTSTRAP_ATTEMPTS = 4

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

function timeoutSignal(): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return controller.signal
}

async function checkedFetch(path: string, accept: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: accept },
      cache: 'no-store',
      signal: timeoutSignal(),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('Simutrans APIからの応答がタイムアウトしました。')
    }
    throw new ApiError('Simutrans APIに接続できません。Simutransの起動状態を確認してください。')
  }

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json() as { error?: string }
      detail = payload.error ? ` ${payload.error}` : ''
    } catch {
      // The status text below remains useful for a non-JSON error response.
    }
    throw new ApiError(`Simutrans APIがエラーを返しました（${response.status}）。${detail}`, response.status)
  }
  return response
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await checkedFetch(path, 'application/json')
  return response.json() as Promise<T>
}

function numberHeader(response: Response, name: string): number {
  const value = response.headers.get(name)
  const parsed = value === null ? Number.NaN : Number(value)
  if (!Number.isFinite(parsed)) throw new ApiError(`APIレスポンスに${name}ヘッダーがありません。`)
  return parsed
}

export async function fetchMapInfo(): Promise<MapInfo> {
  return fetchJson<MapInfo>('/api/v1/map-info')
}

export async function fetchTime(): Promise<TimeSnapshot> {
  return fetchJson<TimeSnapshot>('/api/v1/time')
}

export async function fetchConvoys(): Promise<ConvoyList> {
  return fetchJson<ConvoyList>('/api/v1/convoys?waytype=all')
}

export async function fetchStops(): Promise<StopList> {
  return fetchJson<StopList>('/api/v1/stops')
}

export async function fetchCompanies(): Promise<CompanyList> {
  return fetchJson<CompanyList>('/api/v1/companies')
}

export async function fetchLines(): Promise<LineList> {
  return fetchJson<LineList>('/api/v1/lines?waytype=all')
}

export async function fetchLineSchedule(lineId: number): Promise<LineSchedule> {
  return fetchJson<LineSchedule>(`/api/v1/lines/${lineId}/schedule`)
}

export async function fetchPositions(): Promise<PositionsSnapshot> {
  const response = await checkedFetch('/api/v1/convoy-positions?waytype=all', 'text/csv')
  const csv = await response.text()
  return {
    worldEpoch: numberHeader(response, 'X-Simutrans-World-Epoch'),
    snapshotSequence: numberHeader(response, 'X-Simutrans-Snapshot-Sequence'),
    positions: parseConvoyPositions(csv),
  }
}

export async function fetchWayTopology(): Promise<WayTopologySnapshot> {
  const response = await checkedFetch('/api/v1/way-topology?waytype=all', 'text/csv')
  return {
    worldEpoch: numberHeader(response, 'X-Simutrans-World-Epoch'),
    snapshotSequence: numberHeader(response, 'X-Simutrans-Snapshot-Sequence'),
    tiles: parseWayTopology(await response.text()),
  }
}

export async function loadViewerSnapshot(): Promise<ViewerSnapshot> {
  for (let attempt = 0; attempt < BOOTSTRAP_ATTEMPTS; attempt += 1) {
    const [map, convoyList, positionList, stopList, companyList, lineList, topology] = await Promise.all([
      fetchMapInfo(), fetchConvoys(), fetchPositions(), fetchStops(), fetchCompanies(), fetchLines(), fetchWayTopology(),
    ])
    if (
      map.world_epoch === convoyList.world_epoch
      && map.world_epoch === positionList.worldEpoch
      && map.world_epoch === stopList.world_epoch
      && map.world_epoch === companyList.world_epoch
      && map.world_epoch === lineList.world_epoch
      && map.world_epoch === topology.worldEpoch
    ) {
      const schedules = await Promise.all(lineList.lines.map((line) => fetchLineSchedule(line.id)))
      if (schedules.some((schedule) => schedule.world_epoch !== map.world_epoch)) continue
      const schedulesByLineId = new Map(schedules.map((schedule) => [schedule.line_id, schedule]))
      const lines: DisplayedLine[] = lineList.lines.map((line) => ({
        ...line,
        entries: [...(schedulesByLineId.get(line.id)?.entries ?? [])]
          .sort((left, right) => left.index - right.index),
      }))
      return {
        map,
        time: map.time,
        convoyMetadata: convoyList.convoys,
        convoys: joinConvoys(convoyList.convoys, positionList.positions),
        stops: stopList.stops,
        companies: companyList.companies,
        lines,
        wayTopology: topology.tiles,
      }
    }
  }
  throw new ApiError('マップ切替中のためデータを揃えられませんでした。もう一度更新してください。')
}

export type PositionRefresh =
  | { epochChanged: true }
  | {
      epochChanged: false
      time: TimeSnapshot['time']
      convoyMetadata: ViewerSnapshot['convoyMetadata']
      convoys: ViewerSnapshot['convoys']
      stops: ViewerSnapshot['stops']
      lines: ViewerSnapshot['lines']
    }

export async function refreshPositions(
  snapshot: ViewerSnapshot,
): Promise<PositionRefresh> {
  const [time, convoyList, positions] = await Promise.all([
    fetchTime(), fetchConvoys(), fetchPositions(),
  ])
  if (
    time.world_epoch !== snapshot.map.world_epoch
    || convoyList.world_epoch !== snapshot.map.world_epoch
    || positions.worldEpoch !== snapshot.map.world_epoch
  ) {
    return { epochChanged: true }
  }

  let lines = snapshot.lines
  let stops = snapshot.stops
  const knownLineIds = new Set(lines.map((line) => line.id))
  const unknownLineIds = new Set(convoyList.convoys
    .map((convoy) => convoy.line_id)
    .filter((lineId): lineId is number => lineId !== null && !knownLineIds.has(lineId)))

  if (unknownLineIds.size > 0) {
    const lineList = await fetchLines()
    if (lineList.world_epoch !== snapshot.map.world_epoch) return { epochChanged: true }
    const newLines = lineList.lines.filter((line) => unknownLineIds.has(line.id))
    const schedules = await Promise.all(newLines.map((line) => fetchLineSchedule(line.id)))
    if (schedules.some((schedule) => schedule.world_epoch !== snapshot.map.world_epoch)) {
      return { epochChanged: true }
    }
    const schedulesByLineId = new Map(schedules.map((schedule) => [schedule.line_id, schedule]))
    const additions: DisplayedLine[] = newLines.map((line) => ({
      ...line,
      entries: [...(schedulesByLineId.get(line.id)?.entries ?? [])]
        .sort((left, right) => left.index - right.index),
    }))
    lines = [...lines, ...additions]

    const knownStopIds = new Set(stops.map((stop) => stop.id))
    const hasUnknownStop = additions.some((line) => line.entries.some(
      (entry) => entry.stop_id !== null && !knownStopIds.has(entry.stop_id),
    ))
    if (hasUnknownStop) {
      const stopList = await fetchStops()
      if (stopList.world_epoch !== snapshot.map.world_epoch) return { epochChanged: true }
      stops = stopList.stops
    }
  }

  return {
    epochChanged: false,
    time: time.time,
    convoyMetadata: convoyList.convoys,
    convoys: joinConvoys(convoyList.convoys, positions.positions),
    stops,
    lines,
  }
}
