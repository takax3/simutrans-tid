import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadViewerSnapshot, refreshPositions } from './api'
import {
  alignLinesToStops, clampZoom, filterConvoysForWayTopology,
  filterStopsForLines, findGroupAt, findStopsAt, findWayTopologyCandidatesAt,
  groupConvoysByPosition, topologyAfterCuts, wayTopologyKey, ZOOM_STEP, zoomByWheelDelta,
} from './model'
import { drawMap } from './mapRenderer'
import type { LayerVisibility, PositionGroup, Stop, ViewerSnapshot, WayTopologyTile } from './types'

const intervalOptions = [1_000, 2_000, 5_000, 10_000]
const knownConvoyTypes = [
  { value: 'track', label: '鉄道' },
  { value: 'tram', label: '路面電車' },
  { value: 'monorail', label: 'モノレール' },
  { value: 'maglev', label: 'リニア' },
  { value: 'narrowgauge', label: '狭軌' },
  { value: 'road', label: '自動車' },
  { value: 'water', label: '船' },
  { value: 'air', label: '飛行機' },
]
const defaultConvoyTypes = new Set(['track', 'tram', 'monorail', 'maglev', 'narrowgauge'])
type TopologyTool = 'select' | 'cut' | null
type CandidateAction = 'select' | 'cut' | 'uncut'

function formatTime(snapshot: ViewerSnapshot | null): string {
  if (!snapshot) return '—'
  const { year, month, diagram_time: diagramTime, paused } = snapshot.time
  return `${year}年 ${month}月 ${diagramTime}${paused ? '（一時停止）' : ''}`
}

function App() {
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fullRefreshing, setFullRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [intervalMs, setIntervalMs] = useState(5_000)
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [selectedConvoyTypes, setSelectedConvoyTypes] = useState(() => new Set(defaultConvoyTypes))
  const [alignRoutesToStops, setAlignRoutesToStops] = useState(true)
  const [colorLinesByCompany, setColorLinesByCompany] = useState(true)
  const [showRestrictedDirections, setShowRestrictedDirections] = useState(true)
  const [showAllStops, setShowAllStops] = useState(false)
  const [topologyTool, setTopologyTool] = useState<TopologyTool>(null)
  const [topologySeed, setTopologySeed] = useState<WayTopologyTile | null>(null)
  const [cutTopologyTiles, setCutTopologyTiles] = useState<WayTopologyTile[]>([])
  const [topologyCandidates, setTopologyCandidates] = useState<{
    action: CandidateAction; tiles: WayTopologyTile[]; x: number; y: number
  } | null>(null)
  const [confirmUncut, setConfirmUncut] = useState<WayTopologyTile | null>(null)
  const [topologyNotice, setTopologyNotice] = useState<string | null>(null)
  const [layers, setLayers] = useState<LayerVisibility>({ ways: true, lines: true, convoys: true, stops: true })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [hoveredGroup, setHoveredGroup] = useState<PositionGroup | null>(null)
  const [hoveredStops, setHoveredStops] = useState<Stop[]>([])
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const refreshInFlight = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const zoomRef = useRef(zoom)
  const zoomFrameRef = useRef<number | null>(null)
  const wheelFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelPointRef = useRef({ x: 0, y: 0 })
  const activePointersRef = useRef(new Map<number, { x: number; y: number; type: string }>())
  const pinchDistanceRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const pointerGesturesRef = useRef(new Map<number, { startX: number; startY: number; moved: boolean }>())
  const topologyToolRef = useRef<TopologyTool>(topologyTool)
  const displayedWayTopologyRef = useRef<WayTopologyTile[]>([])
  const filteredWayTopologyRef = useRef<WayTopologyTile[]>([])
  const cutTopologyTilesRef = useRef<WayTopologyTile[]>([])

  topologyToolRef.current = topologyTool

  zoomRef.current = zoom

  const convoyTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const convoy of snapshot?.convoys ?? []) {
      counts.set(convoy.waytype, (counts.get(convoy.waytype) ?? 0) + 1)
    }
    return counts
  }, [snapshot?.convoys])

  const convoyTypeOptions = useMemo(() => {
    const knownValues = new Set(knownConvoyTypes.map((option) => option.value))
    const unknownTypes = [...convoyTypeCounts.keys()]
      .filter((waytype) => !knownValues.has(waytype))
      .sort()
      .map((waytype) => ({ value: waytype, label: waytype }))
    return [...knownConvoyTypes, ...unknownTypes]
  }, [convoyTypeCounts])

  const filteredConvoys = useMemo(
    () => (snapshot?.convoys ?? []).filter((convoy) => selectedConvoyTypes.has(convoy.waytype)),
    [selectedConvoyTypes, snapshot?.convoys],
  )

  const displayedLines = useMemo(
    () => (snapshot?.lines ?? []).filter((line) => selectedConvoyTypes.has(line.waytype)),
    [selectedConvoyTypes, snapshot?.lines],
  )

  const filteredWayTopology = useMemo(
    () => (snapshot?.wayTopology ?? []).filter((tile) => selectedConvoyTypes.has(tile.waytype)),
    [selectedConvoyTypes, snapshot?.wayTopology],
  )
  filteredWayTopologyRef.current = filteredWayTopology

  const cutTopologyKeys = useMemo(
    () => new Set(cutTopologyTiles.map(wayTopologyKey)),
    [cutTopologyTiles],
  )
  const selectedTopology = useMemo(
    () => topologySeed ? topologyAfterCuts(filteredWayTopology, topologySeed, cutTopologyKeys) : null,
    [cutTopologyKeys, filteredWayTopology, topologySeed],
  )
  const selectedTopologyKeys = useMemo(
    () => selectedTopology ? new Set(selectedTopology.map(wayTopologyKey)) : null,
    [selectedTopology],
  )

  const displayedWayTopology = selectedTopology ?? filteredWayTopology
  displayedWayTopologyRef.current = displayedWayTopology
  cutTopologyTilesRef.current = cutTopologyTiles
  const displayedConvoys = useMemo(
    () => selectedTopologyKeys
      ? filterConvoysForWayTopology(filteredConvoys, selectedTopologyKeys)
      : filteredConvoys,
    [filteredConvoys, selectedTopologyKeys],
  )

  const renderedLines = useMemo(
    () => alignRoutesToStops
      ? alignLinesToStops(displayedLines, snapshot?.stops ?? [])
      : displayedLines,
    [alignRoutesToStops, displayedLines, snapshot?.stops],
  )

  const filteredStops = useMemo(
    () => filterStopsForLines(snapshot?.stops ?? [], displayedLines),
    [displayedLines, snapshot?.stops],
  )

  const displayedStops = showAllStops ? (snapshot?.stops ?? []) : filteredStops

  const companiesById = useMemo(
    () => new Map((snapshot?.companies ?? []).map((company) => [company.id, company])),
    [snapshot?.companies],
  )

  const groups = useMemo(() => groupConvoysByPosition(displayedConvoys), [displayedConvoys])

  const renderedLayers = selectedTopology
    ? { ...layers, ways: true, lines: false, convoys: true, stops: false }
    : layers

  const clearTopologySelection = useCallback(() => {
    setTopologySeed(null)
    setCutTopologyTiles([])
    setTopologyTool(null)
    setTopologyCandidates(null)
    setConfirmUncut(null)
    setTopologyNotice(null)
  }, [])

  const toggleConvoyType = (waytype: string) => {
    if (!convoyTypeCounts.has(waytype)) return
    setSelectedConvoyTypes((current) => {
      const next = new Set(current)
      if (next.has(waytype)) next.delete(waytype)
      else next.add(waytype)
      return next
    })
    if (topologySeed?.waytype === waytype) clearTopologySelection()
    setHoveredGroup(null)
  }

  const performRefresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      if (!snapshot) {
        const loaded = await loadViewerSnapshot()
        setSnapshot(loaded)
      } else {
        const refreshed = await refreshPositions(snapshot)
        if (refreshed.epochChanged) {
          setSnapshot(await loadViewerSnapshot())
          clearTopologySelection()
        } else {
          setSnapshot((current) => current ? {
            ...current,
            time: refreshed.time,
            convoyMetadata: refreshed.convoyMetadata,
            convoys: refreshed.convoys,
            stops: refreshed.stops,
            lines: refreshed.lines,
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
  }, [clearTopologySelection, snapshot])

  const performFullRefresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    setFullRefreshing(true)
    try {
      setSnapshot(await loadViewerSnapshot())
      clearTopologySelection()
      setLastUpdated(new Date())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '不明なエラーが発生しました。')
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
      setFullRefreshing(false)
    }
  }, [clearTopologySelection])

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
    drawMap(
      canvasRef.current,
      snapshot.map.size.width,
      snapshot.map.size.height,
      groups,
      displayedStops,
      snapshot.companies,
      displayedWayTopology,
      renderedLines,
      renderedLayers,
      colorLinesByCompany,
      zoom,
      showRestrictedDirections,
      topologySeed,
      cutTopologyTiles,
    )
  }, [colorLinesByCompany, cutTopologyTiles, displayedStops, displayedWayTopology, groups, renderedLayers, renderedLines, showRestrictedDirections, snapshot, topologySeed, zoom])

  const applyTopologyCandidate = useCallback((action: CandidateAction, tile: WayTopologyTile) => {
    setTopologyCandidates(null)
    setTopologyNotice(null)
    if (action === 'select') {
      setTopologySeed(tile)
      setCutTopologyTiles([])
      setTopologyTool(null)
      return
    }
    if (action === 'cut') {
      if (topologySeed && wayTopologyKey(tile) === wayTopologyKey(topologySeed)) {
        setTopologyNotice('起点タイルは切断できません。')
        return
      }
      setCutTopologyTiles((current) => current.some((item) => wayTopologyKey(item) === wayTopologyKey(tile))
        ? current
        : [...current, tile])
      return
    }
    setConfirmUncut(tile)
  }, [topologySeed])

  const handleTopologyTap = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const bounds = viewport.getBoundingClientRect()
    const x = (viewport.scrollLeft + clientX - bounds.left) / zoomRef.current
    const y = (viewport.scrollTop + clientY - bounds.top) / zoomRef.current
    const action: CandidateAction | null = topologyToolRef.current === 'select'
      ? 'select'
      : topologyToolRef.current === 'cut'
        ? 'cut'
        : cutTopologyTilesRef.current.length > 0 ? 'uncut' : null
    if (!action) return
    const source = action === 'select'
      ? filteredWayTopologyRef.current
      : action === 'cut' ? displayedWayTopologyRef.current : cutTopologyTilesRef.current
    const candidates = findWayTopologyCandidatesAt(
      source,
      x,
      y,
      (action === 'uncut' ? 12 : 7) / zoomRef.current,
      knownConvoyTypes.map((option) => option.value),
    )
    if (candidates.length === 0) return
    if (candidates.length === 1) applyTopologyCandidate(action, candidates[0])
    else setTopologyCandidates({ action, tiles: candidates, x: clientX, y: clientY })
  }, [applyTopologyCandidate])

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
    setHoveredStops([])

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
      event.preventDefault()
      const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewport.clientHeight || window.innerHeight
          : 1
      wheelDeltaRef.current += event.deltaY * deltaMultiplier
      wheelPointRef.current = { x: event.clientX, y: event.clientY }

      if (wheelFrameRef.current !== null) return
      wheelFrameRef.current = requestAnimationFrame(() => {
        const delta = wheelDeltaRef.current
        const point = wheelPointRef.current
        wheelDeltaRef.current = 0
        wheelFrameRef.current = null
        zoomAtPoint(zoomByWheelDelta(zoomRef.current, delta), point.x, point.y)
      })
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
      pointerGesturesRef.current.set(event.pointerId, {
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      })
      if (activePointersRef.current.size > 1) {
        for (const gesture of pointerGesturesRef.current.values()) gesture.moved = true
      }
      draggingRef.current = true
      setDragging(true)
      setHoveredGroup(null)
      setHoveredStops([])
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
      const gesture = pointerGesturesRef.current.get(event.pointerId)
      if (gesture && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5) {
        gesture.moved = true
      }

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
      const gesture = pointerGesturesRef.current.get(event.pointerId)
      activePointersRef.current.delete(event.pointerId)
      pointerGesturesRef.current.delete(event.pointerId)
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
      if (gesture && !gesture.moved) {
        handleTopologyTap(event.clientX, event.clientY)
      }
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
      pointerGesturesRef.current.clear()
      pinchDistanceRef.current = null
      draggingRef.current = false
      wheelDeltaRef.current = 0
      if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current)
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
    }
  }, [handleTopologyTap, zoomAtPoint])

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType && event.pointerType !== 'mouse') return
    if (draggingRef.current) return
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (snapshot!.map.size.width / rect.width)
    const y = (event.clientY - rect.top) * (snapshot!.map.size.height / rect.height)
    const group = renderedLayers.convoys ? findGroupAt(groups, x, y, 12 / zoom) : null
    setHoveredGroup(group)
    setHoveredStops(group || !renderedLayers.stops ? [] : findStopsAt(displayedStops, x, y, 10 / zoom))
    setTooltipPosition({ x: event.clientX + 14, y: event.clientY + 14 })
  }

  const changeZoom = (next: number) => {
    setZoom(clampZoom(next))
    setHoveredGroup(null)
    setHoveredStops([])
  }

  const toggleLayer = (layer: keyof LayerVisibility) => {
    const enabled = !layers[layer]
    setLayers((current) => ({ ...current, [layer]: enabled }))
    if (layer === 'ways' && !enabled) clearTopologySelection()
    setHoveredGroup(null)
    setHoveredStops([])
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
          <strong>{snapshot ? displayedConvoys.length : '—'}</strong>
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
          <button className="secondary-button" type="button" onClick={() => void performFullRefresh()} disabled={refreshing}>
            <span className={fullRefreshing ? 'refresh-icon spinning' : 'refresh-icon'}>⟳</span>
            {fullRefreshing ? '全更新中' : '全データ更新'}
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
        <div className="control-group convoy-filter">
          <details className="convoy-type-selector">
            <summary>編成種別 <strong>{displayedConvoys.length} / {snapshot?.convoys.length ?? 0}</strong></summary>
            <fieldset aria-label="表示する編成種別">
              <legend>表示する編成種別</legend>
              {convoyTypeOptions.map((option) => {
                const count = convoyTypeCounts.get(option.value) ?? 0
                return (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      aria-label={`${option.label}編成`}
                      checked={count > 0 && selectedConvoyTypes.has(option.value)}
                      disabled={count === 0}
                      onChange={() => toggleConvoyType(option.value)}
                    />
                    <span>{option.label}</span>
                    <em>{count}</em>
                  </label>
                )
              })}
            </fieldset>
          </details>
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
            className={`map-viewport${dragging ? ' is-dragging' : ''}${topologyTool ? ` is-topology-${topologyTool}` : ''}`}
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
                onPointerLeave={() => {
                  setHoveredGroup(null)
                  setHoveredStops([])
                }}
              />
            ) : (
              <div className="empty-map">
                <div className="empty-grid" />
                <p>{refreshing ? 'Simutransからマップ情報を取得しています…' : 'マップ情報を取得できませんでした。'}</p>
                {!refreshing && <button type="button" onClick={() => void performRefresh()}>再接続</button>}
              </div>
            )}
          </div>
          <div className="map-layer-overlay" aria-label="レイヤー">
            <strong>LAYERS</strong>
            <label>
              <input
                type="checkbox"
                aria-label="線路レイヤー"
                checked={layers.ways}
                onChange={() => toggleLayer('ways')}
              />
              <i className="layer-symbol way" />
              <span>線路</span>
              <em>{displayedWayTopology.length}</em>
            </label>
            <label className="layer-suboption">
              <input
                type="checkbox"
                aria-label="制限方向を表示"
                checked={showRestrictedDirections}
                disabled={!layers.ways}
                onChange={(event) => setShowRestrictedDirections(event.target.checked)}
              />
              <span>制限方向を表示</span>
              <em>{displayedWayTopology.filter((tile) => tile.blocked_ribi !== 0).length}</em>
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="路線レイヤー"
                checked={layers.lines}
                onChange={() => toggleLayer('lines')}
              />
              <i className="layer-symbol line" />
              <span>路線</span>
              <em>{displayedLines.length}</em>
            </label>
            <label className="layer-suboption">
              <input
                type="checkbox"
                aria-label="路線を会社色にする"
                checked={colorLinesByCompany}
                disabled={!layers.lines}
                onChange={(event) => setColorLinesByCompany(event.target.checked)}
              />
              <span>会社色にする</span>
            </label>
            <label className="layer-suboption">
              <input
                type="checkbox"
                aria-label="路線を駅に合わせる"
                checked={alignRoutesToStops}
                disabled={!layers.lines}
                onChange={(event) => setAlignRoutesToStops(event.target.checked)}
              />
              <span>駅に合わせる</span>
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="編成レイヤー"
                checked={layers.convoys}
                onChange={() => toggleLayer('convoys')}
              />
              <i className="layer-symbol convoy" />
              <span>編成</span>
              <em>{displayedConvoys.length}</em>
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="駅レイヤー"
                checked={layers.stops}
                onChange={() => toggleLayer('stops')}
              />
              <i className="layer-symbol stop" />
              <span>駅</span>
              <em>{displayedStops.length}</em>
            </label>
            <label className="layer-suboption">
              <input
                type="checkbox"
                aria-label="全駅表示"
                checked={showAllStops}
                disabled={!layers.stops}
                onChange={(event) => {
                  setShowAllStops(event.target.checked)
                  setHoveredStops([])
                }}
              />
              <span>全駅表示</span>
              <em>{snapshot?.stops.length ?? 0}</em>
            </label>
          </div>
          <div className="topology-tools-overlay" aria-label="路線網操作">
            <strong>NETWORK TOOLS</strong>
            <button
              type="button"
              className={topologyTool === 'select' ? 'is-active' : ''}
              aria-pressed={topologyTool === 'select'}
              disabled={!layers.ways}
              onClick={() => {
                setTopologyTool((current) => current === 'select' ? null : 'select')
                setTopologyCandidates(null)
                setTopologyNotice(null)
              }}
            >路線網を選択</button>
            {topologySeed && (
              <>
                <div className="topology-selection-summary" role="status">
                  <span>{selectedTopology?.length ?? 0}タイル・{displayedConvoys.length}編成</span>
                  <button type="button" onClick={clearTopologySelection}>選択解除</button>
                </div>
                <button
                  type="button"
                  className={topologyTool === 'cut' ? 'is-active' : ''}
                  aria-pressed={topologyTool === 'cut'}
                  onClick={() => {
                    setTopologyTool((current) => current === 'cut' ? null : 'cut')
                    setTopologyCandidates(null)
                    setTopologyNotice(null)
                  }}
                >路線網を切断</button>
                <button type="button" disabled title="未実装">TID表示を作成 <small>未実装</small></button>
              </>
            )}
            {topologyNotice && <p role="alert">{topologyNotice}</p>}
          </div>
          <div className="map-zoom-overlay" aria-label="ズーム操作">
            <button type="button" aria-label="縮小" onClick={() => changeZoom(zoom - ZOOM_STEP)} disabled={zoom <= 0.25}>−</button>
            <output aria-label="現在のズーム率" aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" aria-label="拡大" onClick={() => changeZoom(zoom + ZOOM_STEP)} disabled={zoom >= 4}>＋</button>
            <button className="zoom-reset" type="button" onClick={() => changeZoom(1)} disabled={zoom === 1}>100%に戻す</button>
          </div>
          {topologyCandidates && (
            <div
              className="topology-candidate-popup"
              role="dialog"
              aria-label="線路候補を選択"
              style={{ left: topologyCandidates.x + 10, top: topologyCandidates.y + 10 }}
            >
              <strong>対象の線路を選択</strong>
              {topologyCandidates.tiles.map((tile) => (
                <button
                  type="button"
                  key={wayTopologyKey(tile)}
                  onClick={() => applyTopologyCandidate(topologyCandidates.action, tile)}
                >{tile.waytype} / z{tile.z} <small>({tile.x}, {tile.y})</small></button>
              ))}
              <button type="button" className="popup-cancel" onClick={() => setTopologyCandidates(null)}>キャンセル</button>
            </div>
          )}
          {confirmUncut && (
            <div className="topology-confirm-backdrop">
              <div className="topology-confirm" role="dialog" aria-modal="true" aria-label="切断解除の確認">
                <strong>この切断を解除しますか？</strong>
                <p>{confirmUncut.waytype} / z{confirmUncut.z}（{confirmUncut.x}, {confirmUncut.y}）</p>
                <div>
                  <button type="button" onClick={() => setConfirmUncut(null)}>キャンセル</button>
                  <button type="button" className="confirm-primary" onClick={() => {
                    const key = wayTopologyKey(confirmUncut)
                    setCutTopologyTiles((current) => current.filter((tile) => wayTopologyKey(tile) !== key))
                    setConfirmUncut(null)
                  }}>切断を解除</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <footer className="map-footer">
          <span>座標原点: 左上</span>
          <span>内部解像度: {snapshot ? `${snapshot.map.size.width} × ${snapshot.map.size.height}` : '—'}</span>
          <span>WORLD EPOCH: {snapshot?.map.world_epoch ?? '—'}</span>
          <span>ドラッグ: 移動</span>
          <span>ホイール / ピンチ: ズーム</span>
          {topologyTool === 'select' && <span>クリック / タップ: 路線網を選択</span>}
          {topologyTool === 'cut' && <span>クリック / タップ: 路線網を切断</span>}
        </footer>
      </section>

      {(hoveredGroup || hoveredStops.length > 0) && (
        <aside className="tooltip" style={{ left: tooltipPosition.x, top: tooltipPosition.y }}>
          {hoveredGroup ? (
            <>
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
            </>
          ) : (
            <>
              <div className="tooltip-title">
                <span>座標 {hoveredStops[0].position.x}, {hoveredStops[0].position.y}</span>
                <strong>{hoveredStops.length}駅</strong>
              </div>
              <div className="tooltip-list">
                {hoveredStops.map((stop) => (
                  <article key={stop.id}>
                    <strong>#{stop.id} {stop.name}</strong>
                    <dl>
                      <div><dt>旅客待ち</dt><dd>{stop.passenger_waiting.toLocaleString()}人</dd></div>
                      <div><dt>容量</dt><dd>{stop.passenger_capacity.toLocaleString()}人</dd></div>
                      <div><dt>前月到着</dt><dd>{stop.arrived_last_month.toLocaleString()}</dd></div>
                      <div><dt>前月出発</dt><dd>{stop.departed_last_month.toLocaleString()}</dd></div>
                      <div><dt>座標</dt><dd>{stop.position.x}, {stop.position.y}, z{stop.position.z}</dd></div>
                      <div><dt>所有会社</dt><dd>{stop.owner_company_id === null
                        ? '—'
                        : `${companiesById.get(stop.owner_company_id)?.name || '不明'} (#${stop.owner_company_id})`}</dd></div>
                      <div><dt>停車可能会社ID</dt><dd>{stop.allowed_company_ids.join(', ') || '—'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </aside>
      )}
    </main>
  )
}

export default App
