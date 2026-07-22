import { parseConvoyPositions } from './csv'
import { joinConvoys } from './model'
import type {
  ConvoyList, MapInfo, PositionsSnapshot, TimeSnapshot, ViewerSnapshot,
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
  return fetchJson<ConvoyList>('/api/v1/convoys?waytype=rail')
}

export async function fetchPositions(): Promise<PositionsSnapshot> {
  const response = await checkedFetch('/api/v1/convoy-positions?waytype=rail', 'text/csv')
  const csv = await response.text()
  return {
    worldEpoch: numberHeader(response, 'X-Simutrans-World-Epoch'),
    snapshotSequence: numberHeader(response, 'X-Simutrans-Snapshot-Sequence'),
    positions: parseConvoyPositions(csv),
  }
}

export async function loadViewerSnapshot(): Promise<ViewerSnapshot> {
  for (let attempt = 0; attempt < BOOTSTRAP_ATTEMPTS; attempt += 1) {
    const [map, convoyList, positionList] = await Promise.all([
      fetchMapInfo(), fetchConvoys(), fetchPositions(),
    ])
    if (
      map.world_epoch === convoyList.world_epoch
      && map.world_epoch === positionList.worldEpoch
    ) {
      return {
        map,
        time: map.time,
        convoyMetadata: convoyList.convoys,
        convoys: joinConvoys(convoyList.convoys, positionList.positions),
      }
    }
  }
  throw new ApiError('マップ切替中のためデータを揃えられませんでした。もう一度更新してください。')
}

export type PositionRefresh =
  | { epochChanged: true }
  | { epochChanged: false; time: TimeSnapshot['time']; convoys: ViewerSnapshot['convoys'] }

export async function refreshPositions(
  worldEpoch: number,
  metadata: ViewerSnapshot['convoyMetadata'],
): Promise<PositionRefresh> {
  const [time, positions] = await Promise.all([fetchTime(), fetchPositions()])
  if (time.world_epoch !== worldEpoch || positions.worldEpoch !== worldEpoch) {
    return { epochChanged: true }
  }
  return {
    epochChanged: false,
    time: time.time,
    convoys: joinConvoys(metadata, positions.positions),
  }
}
