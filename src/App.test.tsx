import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadViewerSnapshot, refreshPositions } from './api'
import App from './App'
import type { ViewerSnapshot } from './types'

vi.mock('./api', () => ({
  loadViewerSnapshot: vi.fn(),
  refreshPositions: vi.fn(),
}))

const snapshot: ViewerSnapshot = {
  map: {
    api_version: 'v1', world_epoch: 2, sync_step: 1,
    snapshot_sequence: 1, generated_at_ms: 1,
    size: { width: 1500, height: 1000 },
    time: { year: 1963, month: 7, diagram_time: '03:55:00', paused: false, time_multiplier: 16 },
  },
  time: { year: 1963, month: 7, diagram_time: '03:55:00', paused: false, time_multiplier: 16 },
  convoyMetadata: [
    {
      id: 11, name: '急行11号', company_id: 5, line_id: 3,
      waytype: 'track', vehicle_count: 4, length_carunits: 32,
    },
    {
      id: 12, name: '市電12号', company_id: 5, line_id: 4,
      waytype: 'tram', vehicle_count: 1, length_carunits: 8,
    },
    {
      id: 13, name: 'バス13号', company_id: 5, line_id: null,
      waytype: 'road', vehicle_count: 1, length_carunits: 8,
    },
    {
      id: 14, name: '連絡船14号', company_id: 5, line_id: null,
      waytype: 'water', vehicle_count: 1, length_carunits: 16,
    },
  ],
  convoys: [
    {
      convoy_id: 11, name: '急行11号', company_id: 5, line_id: 3,
      vehicle_count: 4, waytype: 'track', state: 'driving', state_code: 6,
      speed_kmh: 120, x: 910, y: 613, z: 2, route_index: 15,
    },
    {
      convoy_id: 12, name: '市電12号', company_id: 5, line_id: 4,
      vehicle_count: 1, waytype: 'tram', state: 'loading', state_code: 7,
      speed_kmh: 0, x: 800, y: 500, z: 1, route_index: 3,
    },
    {
      convoy_id: 13, name: 'バス13号', company_id: 5, line_id: null,
      vehicle_count: 1, waytype: 'road', state: 'driving', state_code: 6,
      speed_kmh: 40, x: 700, y: 400, z: 1, route_index: 2,
    },
    {
      convoy_id: 14, name: '連絡船14号', company_id: 5, line_id: null,
      vehicle_count: 1, waytype: 'water', state: 'driving', state_code: 6,
      speed_kmh: 20, x: 600, y: 300, z: 0, route_index: 4,
    },
  ],
  stops: [{
    id: 101, name: '中央駅', owner_company_id: 5, allowed_company_ids: [5],
    position: { x: 900, y: 600, z: 2 },
    passenger_waiting: 120, passenger_capacity: 500,
    arrived_last_month: 3200, departed_last_month: 3100,
  }, {
    id: 103, name: '市役所前', owner_company_id: 5, allowed_company_ids: [5],
    position: { x: 700, y: 400, z: 1 },
    passenger_waiting: 20, passenger_capacity: 100,
    arrived_last_month: 800, departed_last_month: 790,
  }],
  companies: [{
    id: 5, name: '常陸交通', current_cash: 100_000, public_service: false,
    ai_type: 'human', ai_active: false, locked: false,
    primary_color_index: 40, secondary_color_index: 64,
  }],
  wayTopology: [
    { x: 850, y: 550, z: 2, waytype: 'track', physical_ribi: 6, blocked_ribi: 0, north_z: null, east_z: 2, south_z: 2, west_z: null },
    { x: 650, y: 350, z: 1, waytype: 'road', physical_ribi: 2, blocked_ribi: 0, north_z: null, east_z: 1, south_z: null, west_z: null },
  ],
  lines: [{
    id: 3, name: '中央線', company_id: 5, waytype: 'track', convoy_count: 1,
    withdraw: false, color_index: 44,
    entries: [
      { index: 0, position: { x: 850, y: 550, z: 2 }, stop_id: 100 },
      { index: 1, position: { x: 900, y: 600, z: 2 }, stop_id: 101 },
    ],
  }, {
    id: 4, name: '市内バス', company_id: 5, waytype: 'road', convoy_count: 1,
    withdraw: false, color_index: 36,
    entries: [
      { index: 0, position: { x: 650, y: 350, z: 1 }, stop_id: 102 },
      { index: 1, position: { x: 700, y: 400, z: 1 }, stop_id: 103 },
    ],
  }],
}

const context = {
  clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
  lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), strokeRect: vi.fn(),
  fillText: vi.fn(), setTransform: vi.fn(),
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  pointerType = 'touch',
  button = 0,
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    clientX: { value: clientX },
    clientY: { value: clientY },
    button: { value: button },
  })
  return event
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(loadViewerSnapshot).mockResolvedValue(snapshot)
  vi.mocked(refreshPositions).mockResolvedValue({
    epochChanged: false,
    time: snapshot.time,
    convoyMetadata: snapshot.convoyMetadata,
    convoys: snapshot.convoys,
    stops: snapshot.stops,
    lines: snapshot.lines,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('実寸Canvasを表示し、ズームと手動更新を操作できる', async () => {
    const user = userEvent.setup()
    render(<App />)

    const canvas = await screen.findByLabelText('1500×1000の編成位置マップ')
    expect(canvas).toHaveAttribute('width', '1500')
    expect(canvas).toHaveAttribute('height', '1000')

    await user.click(screen.getByRole('button', { name: '拡大' }))
    expect(screen.getByLabelText('現在のズーム率')).toHaveTextContent('125%')
    expect(canvas).toHaveStyle({ width: '1875px', height: '1250px' })
    expect(canvas).toHaveAttribute('width', '1875')
    expect(canvas).toHaveAttribute('height', '1250')
    await user.click(screen.getByRole('button', { name: '100%に戻す' }))
    expect(screen.getByLabelText('現在のズーム率')).toHaveTextContent('100%')

    await user.click(screen.getByRole('button', { name: '↻今すぐ更新' }))
    await waitFor(() => expect(refreshPositions).toHaveBeenCalledWith(snapshot))
  })

  it('全データ更新ボタンで完全スナップショットを再取得する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    vi.mocked(loadViewerSnapshot).mockClear()
    await user.click(screen.getByRole('button', { name: '⟳全データ更新' }))
    await waitFor(() => expect(loadViewerSnapshot).toHaveBeenCalledTimes(1))
  })

  it('制限方向の設定を保持しつつ線路レイヤーOFF中は無効にする', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const restrictions = screen.getByRole('checkbox', { name: '制限方向を表示' })
    const ways = screen.getByRole('checkbox', { name: '線路レイヤー' })
    expect(restrictions).toBeChecked()
    await user.click(ways)
    expect(restrictions).toBeDisabled()
    expect(restrictions).toBeChecked()
    await user.click(ways)
    expect(restrictions).toBeEnabled()
    expect(restrictions).toBeChecked()
  })

  it('自動更新の切替・間隔変更と、エラー時のCanvas保持ができる', async () => {
    const user = userEvent.setup()
    render(<App />)
    const canvas = await screen.findByLabelText('1500×1000の編成位置マップ')
    const autoRefresh = screen.getByRole('checkbox', { name: '自動更新' })
    const interval = screen.getByRole('combobox', { name: '間隔' })

    expect(autoRefresh).toBeChecked()
    expect(interval).toHaveValue('5000')
    await user.click(autoRefresh)
    expect(interval).toBeDisabled()
    await user.click(autoRefresh)
    await user.selectOptions(interval, '1000')
    expect(interval).toHaveValue('1000')

    vi.mocked(refreshPositions).mockRejectedValueOnce(new Error('接続テストエラー'))
    await user.click(screen.getByRole('button', { name: '↻今すぐ更新' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('接続テストエラー')
    expect(canvas).toBeInTheDocument()
  })

  it('MAP内のホイールをキャンセルしてカーソル位置で滑らかにズームする', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 20, top: 10, right: 820, bottom: 610, width: 800, height: 600, x: 20, y: 10, toJSON: () => undefined }),
    })
    viewport.scrollLeft = 200
    viewport.scrollTop = 100

    const mapZoom = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: false, deltaY: -100,
      clientX: 120, clientY: 110,
    })
    fireEvent(viewport, mapZoom)
    expect(mapZoom.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByLabelText('現在のズーム率')).toHaveTextContent('122%'))

    await waitFor(() => {
      const currentZoom = Number(screen.getByLabelText('現在のズーム率').textContent?.replace('%', '')) / 100
      expect(viewport.scrollLeft).toBeCloseTo(300 * currentZoom - 100, 0)
      expect(viewport.scrollTop).toBeCloseTo(200 * currentZoom - 100, 0)
    })
  })

  it('MAP内のCtrl＋ホイールもブラウザへ渡さずズームする', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    const mapZoom = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100,
      clientX: 120, clientY: 100,
    })
    fireEvent(viewport, mapZoom)
    expect(mapZoom.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByLabelText('現在のズーム率')).toHaveTextContent('122%'))
  })

  it('1本指でパンし、2本指のピンチアウトでMAPだけを拡大する', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() })
    viewport.scrollLeft = 200
    viewport.scrollTop = 150

    fireEvent(viewport, pointerEvent('pointerdown', 1, 100, 100))
    fireEvent(viewport, pointerEvent('pointermove', 1, 80, 70))
    expect(viewport.scrollLeft).toBe(220)
    expect(viewport.scrollTop).toBe(180)

    fireEvent(viewport, pointerEvent('pointerdown', 2, 180, 70))
    fireEvent(viewport, pointerEvent('pointermove', 2, 205, 70))
    expect(await screen.findByLabelText('現在のズーム率')).toHaveTextContent('125%')
  })

  it('マウスの左ドラッグでMAPを掴んで移動する', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    Object.defineProperties(viewport, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
    })
    viewport.scrollLeft = 400
    viewport.scrollTop = 300

    fireEvent(viewport, pointerEvent('pointerdown', 10, 300, 250, 'mouse'))
    expect(viewport).toHaveClass('is-dragging')
    fireEvent(viewport, pointerEvent('pointermove', 10, 240, 210, 'mouse'))
    expect(viewport.scrollLeft).toBe(460)
    expect(viewport.scrollTop).toBe(340)

    fireEvent(viewport, pointerEvent('pointerup', 10, 240, 210, 'mouse'))
    expect(viewport).not.toHaveClass('is-dragging')
  })

  it('右ドラッグではMAPを移動しない', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    viewport.scrollLeft = 100
    fireEvent(viewport, pointerEvent('pointerdown', 11, 100, 100, 'mouse', 2))
    fireEvent(viewport, pointerEvent('pointermove', 11, 50, 100, 'mouse', 2))
    expect(viewport.scrollLeft).toBe(100)
    expect(viewport).not.toHaveClass('is-dragging')
  })

  it('選択モードのクリックで連結線路網と、その上の編成だけを表示する', async () => {
    const user = userEvent.setup()
    const selectableSnapshot: ViewerSnapshot = {
      ...snapshot,
      wayTopology: [
        { x: 910, y: 613, z: 2, waytype: 'track', physical_ribi: 2, blocked_ribi: 0, north_z: null, east_z: 2, south_z: null, west_z: null },
        { x: 911, y: 613, z: 2, waytype: 'track', physical_ribi: 8, blocked_ribi: 0, north_z: null, east_z: null, south_z: null, west_z: 2 },
        { x: 800, y: 500, z: 1, waytype: 'tram', physical_ribi: 0, blocked_ribi: 0, north_z: null, east_z: null, south_z: null, west_z: null },
      ],
    }
    vi.mocked(loadViewerSnapshot).mockResolvedValueOnce(selectableSnapshot)
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    Object.defineProperties(viewport, {
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1500, bottom: 1000, width: 1500, height: 1000, x: 0, y: 0, toJSON: () => undefined }),
      },
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
    })

    await user.click(screen.getByRole('button', { name: '路線網を選択' }))
    expect(viewport).toHaveClass('is-topology-select')
    fireEvent(viewport, pointerEvent('pointerdown', 21, 910, 613, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerup', 21, 910, 613, 'mouse'))

    expect(await screen.findByText('2タイル・1編成')).toBeInTheDocument()
    expect(screen.getByText('路線').closest('label')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: '現在の設定を保存' }))
    const saveDialog = screen.getByRole('dialog', { name: '路線網設定を保存' })
    await user.type(within(saveDialog).getByRole('textbox'), 'テスト路線網')
    await user.click(within(saveDialog).getByRole('button', { name: '保存' }))
    expect(screen.getByRole('option', { name: 'テスト路線網' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '現在の設定を保存' }))
    await user.click(within(screen.getByRole('dialog', { name: '路線網設定を保存' })).getByRole('button', { name: '保存' }))
    expect(screen.getByRole('dialog', { name: '保存設定の上書き確認' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog', { name: '保存設定の上書き確認' })).getByRole('button', { name: 'キャンセル' }))
    await user.click(within(screen.getByRole('dialog', { name: '路線網設定を保存' })).getByRole('button', { name: 'キャンセル' }))
    vi.mocked(refreshPositions).mockResolvedValueOnce({
      epochChanged: false,
      time: selectableSnapshot.time,
      convoyMetadata: selectableSnapshot.convoyMetadata,
      convoys: selectableSnapshot.convoys.map((convoy) => convoy.convoy_id === 11
        ? { ...convoy, x: 999, y: 999 }
        : convoy),
      stops: selectableSnapshot.stops,
      lines: selectableSnapshot.lines,
    })
    await user.click(screen.getByRole('button', { name: '↻今すぐ更新' }))
    expect(await screen.findByText('2タイル・0編成')).toBeInTheDocument()
    const cutButton = screen.getByRole('button', { name: '路線網を切断' })
    expect(screen.getByRole('button', { name: /TID表示を作成/ })).toBeDisabled()
    await user.click(cutButton)
    expect(viewport).toHaveClass('is-topology-cut')
    fireEvent(viewport, pointerEvent('pointerdown', 24, 911, 613, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerup', 24, 911, 613, 'mouse'))
    expect(await screen.findByText('1タイル・0編成')).toBeInTheDocument()
    await user.click(cutButton)
    fireEvent(viewport, pointerEvent('pointerdown', 25, 911, 613, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerup', 25, 911, 613, 'mouse'))
    expect(await screen.findByRole('dialog', { name: '切断解除の確認' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切断を解除' }))
    expect(await screen.findByText('2タイル・0編成')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '選択解除' }))
    expect(screen.queryByText(/タイル・.*編成/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '路線網を選択' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: '読み込む' }))
    expect(await screen.findByText('2タイル・0編成')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '削除' }))
    const deleteDialog = screen.getByRole('dialog', { name: '保存設定の削除確認' })
    await user.click(within(deleteDialog).getByRole('button', { name: '削除' }))
    expect(screen.queryByRole('option', { name: 'テスト路線網' })).not.toBeInTheDocument()
  })

  it('選択モードでもドラッグと空白クリックでは線路網を選択しない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')
    Object.defineProperties(viewport, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
    })
    await user.click(screen.getByRole('button', { name: '路線網を選択' }))
    fireEvent(viewport, pointerEvent('pointerdown', 22, 10, 10, 'mouse'))
    fireEvent(viewport, pointerEvent('pointermove', 22, 30, 30, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerup', 22, 30, 30, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerdown', 23, 20, 20, 'mouse'))
    fireEvent(viewport, pointerEvent('pointerup', 23, 20, 20, 'mouse'))
    expect(screen.queryByText(/タイル・.*編成/)).not.toBeInTheDocument()
  })

  it('路線・編成・駅レイヤーを個別にON/OFFできる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const lineLayer = screen.getByRole('checkbox', { name: '路線レイヤー' })
    const companyLineColor = screen.getByRole('checkbox', { name: '路線を会社色にする' })
    const alignRoutes = screen.getByRole('checkbox', { name: '路線を駅に合わせる' })
    const convoyLayer = screen.getByRole('checkbox', { name: '編成レイヤー' })
    const stopLayer = screen.getByRole('checkbox', { name: '駅レイヤー' })
    const allStops = screen.getByRole('checkbox', { name: '全駅表示' })

    expect(lineLayer).toBeChecked()
    expect(companyLineColor).toBeChecked()
    expect(companyLineColor).toBeEnabled()
    expect(alignRoutes).toBeChecked()
    expect(alignRoutes).toBeEnabled()
    expect(convoyLayer).toBeChecked()
    expect(stopLayer).toBeChecked()
    expect(allStops).not.toBeChecked()
    expect(allStops).toBeEnabled()
    expect(screen.getByText('路線').closest('label')).toHaveTextContent('1')
    await user.click(lineLayer)
    expect(lineLayer).not.toBeChecked()
    expect(companyLineColor).toBeDisabled()
    expect(alignRoutes).toBeDisabled()
    await user.click(lineLayer)
    expect(companyLineColor).toBeChecked()
    await user.click(companyLineColor)
    expect(companyLineColor).not.toBeChecked()
    expect(convoyLayer).toBeChecked()
    expect(stopLayer).toBeChecked()
    await user.click(stopLayer)
    expect(stopLayer).not.toBeChecked()
    expect(allStops).toBeDisabled()
    expect(convoyLayer).toBeChecked()
    await user.click(convoyLayer)
    expect(convoyLayer).not.toBeChecked()
  })

  it('全駅表示をONにすると編成種別にかかわらず全駅を表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const stopLayerLabel = screen.getByText('駅').closest('label')
    const allStops = screen.getByRole('checkbox', { name: '全駅表示' })

    expect(stopLayerLabel).toHaveTextContent('1')
    expect(allStops).not.toBeChecked()
    await user.click(allStops)
    expect(allStops).toBeChecked()
    expect(stopLayerLabel).toHaveTextContent('2')
  })

  it('鉄道系だけを初期表示し、存在する他の編成種別を複数選択できる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    await user.click(screen.getByText(/^編成種別/, { selector: 'summary' }))
    const selector = within(screen.getByRole('group', { name: '表示する編成種別' }))
    const track = selector.getByRole('checkbox', { name: '鉄道編成' })
    const tram = selector.getByRole('checkbox', { name: '路面電車編成' })
    const road = selector.getByRole('checkbox', { name: '自動車編成' })
    const water = selector.getByRole('checkbox', { name: '船編成' })
    const air = selector.getByRole('checkbox', { name: '飛行機編成' })

    expect(track).toBeChecked()
    expect(tram).toBeChecked()
    expect(road).not.toBeChecked()
    expect(road).toBeEnabled()
    expect(water).toBeEnabled()
    expect(air).toBeDisabled()

    const telemetry = within(screen.getByLabelText('運行情報'))
    expect(telemetry.getByText('CONVOYS').parentElement).toHaveTextContent('2')
    expect(screen.getByText('路線').closest('label')).toHaveTextContent('1')
    expect(screen.getByText('駅').closest('label')).toHaveTextContent('1')
    await user.click(road)
    expect(road).toBeChecked()
    expect(telemetry.getByText('CONVOYS').parentElement).toHaveTextContent('3')
    expect(screen.getByText('編成').closest('label')).toHaveTextContent('3')
    expect(screen.getByText('路線').closest('label')).toHaveTextContent('2')
    expect(screen.getByText('駅').closest('label')).toHaveTextContent('2')
  })

  it('駅ホバーに所有会社と停車可能会社IDを表示する', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('1500×1000の編成位置マップ')
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1500, bottom: 1000, width: 1500, height: 1000, x: 0, y: 0, toJSON: () => undefined }),
    })

    fireEvent.pointerMove(canvas, { clientX: 900, clientY: 600, pointerType: 'mouse' })

    expect(await screen.findByText('常陸交通 (#5)')).toBeInTheDocument()
    expect(screen.getByText('停車可能会社ID').parentElement).toHaveTextContent('5')
  })
})
