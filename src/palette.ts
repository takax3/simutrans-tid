import type { Company } from './types'

// Source: Simutrans official repository, documentation/simutrans-palette.pal
// https://github.com/simutrans/simutrans/blob/master/documentation/simutrans-palette.pal
// Synced on 2026-07-24. These are the unshaded daytime palette colors.
export const SIMUTRANS_PALETTE: readonly string[] = Object.freeze([
  '#244B67', '#395E7C', '#4C7191', '#6084A7', '#7497BD', '#88ABD3', '#9CBEE9', '#B0D2FF',
  '#585858', '#6B6B6B', '#7D7D7D', '#909090', '#A2A2A2', '#B5B5B5', '#C8C8C8', '#DBDBDB',
  '#113785', '#1B4796', '#2556A7', '#3066B9', '#3A75CA', '#4585DC', '#4F95ED', '#5AA5FF',
  '#7B5803', '#8E6F04', '#A18605', '#B49D07', '#C6B408', '#D9CB0A', '#ECE20B', '#FFF90D',
  '#56200E', '#6E2810', '#863012', '#9E3914', '#B64116', '#CE4A18', '#E6521A', '#FF5B1C',
  '#223B0A', '#2C500E', '#356512', '#3F7A16', '#4D8F1D', '#5CA425', '#6AB92C', '#79CF34',
  '#00564E', '#006C62', '#008276', '#00988A', '#00AE9E', '#00C4B2', '#00DAC6', '#00F1DB',
  '#4A077A', '#5F158B', '#74259C', '#8A35AD', '#A045BF', '#B555D0', '#CB65E1', '#E175F3',
  '#3B2900', '#533700', '#6B4500', '#835400', '#9B6200', '#B37100', '#CB8000', '#E38F00',
  '#57002B', '#6F0B45', '#871C5C', '#9F2D73', '#B73E8A', '#E64AAE', '#F579C2', '#FF9CD1',
  '#14300A', '#2C4A1C', '#44632D', '#5D7C3E', '#76954F', '#8FAE60', '#A8C771', '#C1E182',
  '#36131D', '#522C2C', '#6E453A', '#8B5F48', '#A87956', '#C59365', '#E2AD73', '#FFC782',
  '#080B64', '#0E1674', '#14218B', '#1A2CA2', '#294AB9', '#3968D0', '#4C84E7', '#60A0FF',
  '#2B1E2E', '#443255', '#5D466E', '#765B82', '#8F6FAA', '#A884BE', '#C199D2', '#DBAEE6',
  '#3F120C', '#5A261E', '#753A2A', '#914E37', '#AC6243', '#C87650', '#E38A5C', '#FF9F69',
  '#0B441E', '#215E38', '#367851', '#4C936A', '#62AE83', '#78C99C', '#8EE4B5', '#A4FFCF',
  '#400000', '#600000', '#800000', '#C00000', '#FF0000', '#FF4040', '#FF6060', '#FF8080',
  '#008000', '#00C400', '#00E100', '#00F000', '#00FF00', '#40FF40', '#5EFF5E', '#80FF80',
  '#000080', '#0000C0', '#0000E0', '#0000FF', '#0040FF', '#005EFF', '#006AFF', '#0080FF',
  '#804000', '#C16100', '#D76B00', '#FF8000', '#FF8000', '#FF952B', '#FFAA55', '#FFC184',
  '#083400', '#104000', '#205004', '#306004', '#40700C', '#548414', '#68941C', '#80A82C',
  '#A4A400', '#C1C100', '#D7D700', '#FFFF00', '#FFFF20', '#FFFF40', '#FFFF80', '#FFFFAC',
  '#200400', '#401408', '#541C10', '#6C2C1C', '#803828', '#944838', '#A85C4C', '#B86C58',
  '#400000', '#600800', '#701000', '#782008', '#8A4010', '#9C4820', '#AE6030', '#C08040',
  '#202000', '#404000', '#606000', '#808000', '#909000', '#ACAC00', '#C0C000', '#E0E000',
  '#406008', '#506C20', '#607830', '#709038', '#80AC40', '#96D244', '#ACEE50', '#C0FF60',
  '#202020', '#303030', '#404040', '#505050', '#606060', '#ACACAC', '#ECECEC', '#FFFFFF',
  '#292936', '#3C2D46', '#4B3E6C', '#5F4D88', '#716996', '#8778B0', '#A591DA', '#C6BFE8',
  '#01DD01', '#FF211D', '#FFFF53', '#7F9BF1', '#C1B1D1', '#57656F', '#E3E3FF', '#4D4D4D',
  '#FF017F', '#0101FF', '#000000', '#6B6B6B', '#9B9B9B', '#B3B3B3', '#C9C9C9', '#DFDFDF',
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#C0C0C0',
  '#808080', '#FF0000', '#00FF00', '#FFFF00', '#0000FF', '#FF00FF', '#00FFFF', '#FFFFFF',
])

export function simutransPaletteColor(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= SIMUTRANS_PALETTE.length) return null
  return SIMUTRANS_PALETTE[index] ?? null
}

export function companyPrimaryColor(company: Pick<Company, 'primary_color_index'>): string | null {
  return simutransPaletteColor(company.primary_color_index + 3)
}
