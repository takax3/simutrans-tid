import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  convoyMetadata: [{
    id: 11, name: '急行11号', company_id: 5, line_id: 3,
    waytype: 'track', vehicle_count: 4, length_carunits: 32,
  }],
  convoys: [{
    convoy_id: 11, name: '急行11号', company_id: 5, line_id: 3,
    vehicle_count: 4, waytype: 'track', state: 'driving', state_code: 6,
    speed_kmh: 120, x: 910, y: 613, z: 2, route_index: 15,
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
  vi.mocked(loadViewerSnapshot).mockResolvedValue(snapshot)
  vi.mocked(refreshPositions).mockResolvedValue({
    epochChanged: false,
    time: snapshot.time,
    convoys: snapshot.convoys,
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
    await waitFor(() => expect(refreshPositions).toHaveBeenCalledWith(2, snapshot.convoyMetadata))
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

  it('MAP内のCtrl＋ホイールだけをキャンセルしてカーソル位置でズームする', async () => {
    render(<App />)
    await screen.findByLabelText('1500×1000の編成位置マップ')
    const viewport = screen.getByTestId('map-viewport')

    const browserScroll = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: false, deltaY: -100,
    })
    fireEvent(viewport, browserScroll)
    expect(browserScroll.defaultPrevented).toBe(false)
    expect(screen.getByLabelText('現在のズーム率')).toHaveTextContent('100%')

    const mapZoom = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100,
      clientX: 120, clientY: 100,
    })
    fireEvent(viewport, mapZoom)
    expect(mapZoom.defaultPrevented).toBe(true)
    expect(await screen.findByLabelText('現在のズーム率')).toHaveTextContent('125%')
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
})
