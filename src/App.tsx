import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadViewerSnapshot, refreshPositions } from './api'
import { clampZoom, findGroupAt, groupConvoysByPosition, ZOOM_STEP } from './model'
import { drawMap } from './mapRenderer'
import type { PositionGroup, ViewerSnapshot } from './types'

const intervalOptions = [1_000, 2_000, 5_000, 10_000]

function formatTime(snapshot: ViewerSnapshot | null): string {
  if (!snapshot) return '—'
  const { year, month, diagram_time: diagramTime, paused } = snapshot.time
  return `${year}年 ${month}月 ${diagramTime}${paused ? '（一時停止）' : ''}`
}

function App() {
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [intervalMs, setIntervalMs] = useState(5_000)
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [hoveredGroup, setHoveredGroup] = useState<PositionGroup | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const refreshInFlight = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const zoomRef = useRef(zoom)
  const zoomFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const activePointersRef = useRef(new Map<number, { x: number; y: number; type: string }>())
  const pinchDistanceRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  zoomRef.current = zoom

  const groups = useMemo(
    () => groupConvoysByPosition(snapshot?.convoys ?? []),
    [snapshot?.convoys],
  )

  const performRefresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      if (!snapshot) {
        const loaded = await loadViewerSnapshot()
        setSnapshot(loaded)
      } else {
        const refreshed = await refreshPositions(snapshot.map.world_epoch, snapshot.convoyMetadata)
        if (refreshed.epochChanged) {
          setSnapshot(await loadViewerSnapshot())
        } else {
          setSnapshot((current) => current ? {
            ...current,
            time: refreshed.time,
            convoys: refreshed.convoys,
          } : current)
        }
      }
      setLastUpdated(new Date())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '不明なエラーが発生しました。')
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }, [snapshot])

  refreshRef.current = performRefresh

  useEffect(() => {
    void refreshRef.current()
  }, [])

  useEffect(() => {
    if (!autoRefresh || !snapshot) return undefined
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(async () => {
        await refreshRef.current()
        if (!cancelled) schedule()
      }, intervalMs)
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [autoRefresh, intervalMs, Boolean(snapshot)])

  useEffect(() => {
    if (!canvasRef.current || !snapshot) return
    drawMap(canvasRef.current, snapshot.map.size.width, snapshot.map.size.height, groups, zoom)
  }, [groups, snapshot, zoom])

  const zoomAtPoint = useCallback((requestedZoom: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const currentZoom = zoomRef.current
    const nextZoom = clampZoom(requestedZoom)
    if (nextZoom === currentZoom) return

    const bounds = viewport.getBoundingClientRect()
    const pointerX = clientX - bounds.left
    const pointerY = clientY - bounds.top
    const mapX = (viewport.scrollLeft + pointerX) / currentZoom
    const mapY = (viewport.scrollTop + pointerY) / currentZoom

    zoomRef.current = nextZoom
    setZoom(nextZoom)
    setHoveredGroup(null)

    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
    zoomFrameRef.current = requestAnimationFrame(() => {
      viewport.scrollLeft = mapX * nextZoom - pointerX
      viewport.scrollTop = mapY * nextZoom - pointerY
      zoomFrameRef.current = null
    })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      wheelDeltaRef.current += event.deltaY
      if (Math.abs(wheelDeltaRef.current) < 30) return
      const direction = wheelDeltaRef.current < 0 ? 1 : -1
      wheelDeltaRef.current = 0
      zoomAtPoint(zoomRef.current + direction * ZOOM_STEP, event.clientX, event.clientY)
    }

    const distanceAndCenter = () => {
      const points = [...activePointersRef.current.values()]
        .filter((point) => point.type === 'touch')
        .slice(0, 2)
      if (points.length < 2) return null
      return {
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!['mouse', 'touch', 'pen'].includes(event.pointerType)) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      viewport.setPointerCapture?.(event.pointerId)
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      })
      draggingRef.current = true
      setDragging(true)
      setHoveredGroup(null)
      const pinch = distanceAndCenter()
      pinchDistanceRef.current = pinch?.distance ?? null
    }

    const handlePointerMove = (event: PointerEvent) => {
      const previous = activePointersRef.current.get(event.pointerId)
      if (!previous) return
      event.preventDefault()
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      })

      if (activePointersRef.current.size === 1) {
        viewport.scrollLeft -= event.clientX - previous.x
        viewport.scrollTop -= event.clientY - previous.y
        return
      }

      const pinch = distanceAndCenter()
      if (!pinch || !pinchDistanceRef.current || pinch.distance === 0) return
      const scale = pinch.distance / pinchDistanceRef.current
      pinchDistanceRef.current = pinch.distance
      zoomAtPoint(zoomRef.current * scale, pinch.x, pinch.y)
    }

    const handlePointerEnd = (event: PointerEvent) => {
      if (!activePointersRef.current.has(event.pointerId)) return
      activePointersRef.current.delete(event.pointerId)
      try {
        viewport.releasePointerCapture?.(event.pointerId)
      } catch {
        // Capture may already have been released by the browser.
      }
      if (activePointersRef.current.size === 0) {
        draggingRef.current = false
        setDragging(false)
      }
      const pinch = distanceAndCenter()
      pinchDistanceRef.current = pinch?.distance ?? null
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    viewport.addEventListener('pointerdown', handlePointerDown)
    viewport.addEventListener('pointermove', handlePointerMove)
    viewport.addEventListener('pointerup', handlePointerEnd)
    viewport.addEventListener('pointercancel', handlePointerEnd)

    return () => {
      viewport.removeEventListener('wheel', handleWheel)
      viewport.removeEventListener('pointerdown', handlePointerDown)
      viewport.removeEventListener('pointermove', handlePointerMove)
      viewport.removeEventListener('pointerup', handlePointerEnd)
      viewport.removeEventListener('pointercancel', handlePointerEnd)
      activePointersRef.current.clear()
      pinchDistanceRef.current = null
      draggingRef.current = false
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
    }
  }, [zoomAtPoint])

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType && event.pointerType !== 'mouse') return
    if (draggingRef.current) return
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (snapshot!.map.size.width / rect.width)
    const y = (event.clientY - rect.top) * (snapshot!.map.size.height / rect.height)
    setHoveredGroup(findGroupAt(groups, x, y, 12 / zoom))
    setTooltipPosition({ x: event.clientX + 14, y: event.clientY + 14 })
  }

  const changeZoom = (next: number) => {
    setZoom(clampZoom(next))
    setHoveredGroup(null)
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">SIMUTRANS OBSERVER / LOCAL</p>
          <h1>Simutrans TID</h1>
          <p className="subtitle">マップ座標上の編成位置を、そのまま観察する。</p>
        </div>
        <div className={`connection-pill ${error ? 'is-error' : snapshot ? 'is-online' : ''}`}>
          <span className="status-dot" />
          {error ? '接続エラー' : snapshot ? 'API接続中' : '接続確認中'}
        </div>
      </header>

      <section className="telemetry" aria-label="運行情報">
        <div className="metric wide">
          <span>SIMUTRANS TIME</span>
          <strong>{formatTime(snapshot)}</strong>
        </div>
        <div className="metric">
          <span>CONVOYS</span>
          <strong>{snapshot?.convoys.length ?? '—'}</strong>
        </div>
        <div className="metric">
          <span>MAP SIZE</span>
          <strong>{snapshot ? `${snapshot.map.size.width} × ${snapshot.map.size.height}` : '—'}</strong>
        </div>
        <div className="metric wide">
          <span>LAST UPDATED</span>
          <strong>{lastUpdated?.toLocaleTimeString('ja-JP') ?? '—'}</strong>
        </div>
      </section>

      <section className="controls" aria-label="表示と更新の操作">
        <div className="control-group">
          <button className="primary-button" type="button" onClick={() => void performRefresh()} disabled={refreshing}>
            <span className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span>
            {refreshing ? '更新中' : '今すぐ更新'}
          </button>
          <label className="switch-control">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span className="switch" />
            自動更新
          </label>
          <label className="select-control">
            <span>間隔</span>
            <select value={intervalMs} onChange={(event) => setIntervalMs(Number(event.target.value))} disabled={!autoRefresh}>
              {intervalOptions.map((value) => <option key={value} value={value}>{value / 1_000}秒</option>)}
            </select>
          </label>
        </div>
      </section>

      {error && <div className="error-banner" role="alert"><strong>データを更新できませんでした。</strong><span>{error}</span></div>}

      <section className="map-panel">
        <div className="map-panel-header">
          <div>
            <span className="section-number">01</span>
            <h2>POSITION MAP</h2>
          </div>
          <div className="legend" aria-label="凡例">
            <span><i className="legend-dot driving" />走行中</span>
            <span><i className="legend-dot stopped" />停車・待機</span>
            <span><i className="legend-dot other" />その他</span>
          </div>
        </div>
        <div className="map-stage">
          <div
            ref={viewportRef}
            className={`map-viewport${dragging ? ' is-dragging' : ''}`}
            data-testid="map-viewport"
          >
            {snapshot ? (
              <canvas
                ref={canvasRef}
                style={{
                  width: snapshot.map.size.width * zoom,
                  height: snapshot.map.size.height * zoom,
                }}
                aria-label={`${snapshot.map.size.width}×${snapshot.map.size.height}の編成位置マップ`}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoveredGroup(null)}
              />
            ) : (
              <div className="empty-map">
                <div className="empty-grid" />
                <p>{refreshing ? 'Simutransからマップ情報を取得しています…' : 'マップ情報を取得できませんでした。'}</p>
                {!refreshing && <button type="button" onClick={() => void performRefresh()}>再接続</button>}
              </div>
            )}
          </div>
          <div className="map-zoom-overlay" aria-label="ズーム操作">
            <button type="button" aria-label="縮小" onClick={() => changeZoom(zoom - ZOOM_STEP)} disabled={zoom <= 0.25}>−</button>
            <output aria-label="現在のズーム率" aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" aria-label="拡大" onClick={() => changeZoom(zoom + ZOOM_STEP)} disabled={zoom >= 4}>＋</button>
            <button className="zoom-reset" type="button" onClick={() => changeZoom(1)} disabled={zoom === 1}>100%に戻す</button>
          </div>
        </div>
        <footer className="map-footer">
          <span>座標原点: 左上</span>
          <span>内部解像度: {snapshot ? `${snapshot.map.size.width} × ${snapshot.map.size.height}` : '—'}</span>
          <span>WORLD EPOCH: {snapshot?.map.world_epoch ?? '—'}</span>
          <span>ドラッグ: 移動</span>
          <span>Ctrl＋ホイール / ピンチ: ズーム</span>
        </footer>
      </section>

      {hoveredGroup && (
        <aside className="tooltip" style={{ left: tooltipPosition.x, top: tooltipPosition.y }}>
          <div className="tooltip-title">
            <span>座標 {hoveredGroup.x}, {hoveredGroup.y}</span>
            <strong>{hoveredGroup.convoys.length}編成</strong>
          </div>
          <div className="tooltip-list">
            {hoveredGroup.convoys.map((convoy) => (
              <article key={convoy.convoy_id}>
                <strong>#{convoy.convoy_id} {convoy.name}</strong>
                <dl>
                  <div><dt>状態</dt><dd>{convoy.state}</dd></div>
                  <div><dt>速度</dt><dd>{convoy.speed_kmh} km/h</dd></div>
                  <div><dt>座標</dt><dd>{convoy.x}, {convoy.y}, z{convoy.z}</dd></div>
                  <div><dt>種別</dt><dd>{convoy.waytype}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </aside>
      )}
    </main>
  )
}

export default App
