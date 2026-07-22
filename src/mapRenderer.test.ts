import { describe, expect, it } from 'vitest'
import { calculateBackingScale } from './mapRenderer'

describe('calculateBackingScale', () => {
  it('ズーム率と端末の画素密度を内部解像度へ反映する', () => {
    expect(calculateBackingScale(1500, 1000, 1, 1)).toBe(1)
    expect(calculateBackingScale(1500, 1000, 1.25, 1)).toBe(1.25)
    expect(calculateBackingScale(1500, 1000, 1, 2)).toBe(2)
  })

  it('高倍率時はCanvasのメモリ使用量を安全な範囲に制限する', () => {
    const scale = calculateBackingScale(1500, 1000, 4, 2)
    expect(scale).toBeGreaterThanOrEqual(4)
    expect(1500 * scale).toBeLessThanOrEqual(8192)
    expect(1500 * 1000 * scale * scale).toBeLessThanOrEqual(32_000_000.01)
  })
})
