import { describe, expect, it } from 'vitest'
import { companyPrimaryColor, SIMUTRANS_PALETTE, simutransPaletteColor } from './palette'

describe('Simutrans標準パレット', () => {
  it('公式パレットの256色を色番号から取得する', () => {
    expect(SIMUTRANS_PALETTE).toHaveLength(256)
    expect(simutransPaletteColor(0)).toBe('#244B67')
    expect(simutransPaletteColor(43)).toBe('#3F7A16')
    expect(simutransPaletteColor(255)).toBe('#FFFFFF')
  })

  it('会社のプライマリー色は色グループの中間色を使う', () => {
    expect(companyPrimaryColor({ primary_color_index: 40 })).toBe('#3F7A16')
    expect(companyPrimaryColor({ primary_color_index: 253 })).toBeNull()
    expect(simutransPaletteColor(-1)).toBeNull()
    expect(simutransPaletteColor(1.5)).toBeNull()
  })
})
