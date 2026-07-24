import { describe, expect, it } from 'vitest'
import {
  createSavedTopology, loadSavedTopologies, parseSavedTopology, resolveSavedTopology,
  SAVED_TOPOLOGY_STORAGE_KEY, storeSavedTopologies, topologyExportFilename,
} from './savedTopology'
import type { WayTopologyTile } from './types'

const tile = (x: number, z = 0): WayTopologyTile => ({
  x, y: 5, z, waytype: 'track', physical_ribi: 0, blocked_ribi: 0,
  north_z: null, east_z: null, south_z: null, west_z: null,
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('saved topology', () => {
  it('起点と切断位置を保存し、既存設定のIDと作成日時を維持して更新する', () => {
    const first = createSavedTopology('本線', tile(1), [tile(2)], { width: 100, height: 80 }, undefined, new Date('2026-01-01'))
    const updated = createSavedTopology('本線', tile(3), [tile(4)], { width: 100, height: 80 }, first, new Date('2026-02-01'))
    expect(updated.id).toBe(first.id)
    expect(updated.createdAt).toBe(first.createdAt)
    expect(updated.updatedAt).not.toBe(first.updatedAt)
    expect(updated.seed.x).toBe(3)
  })

  it('一覧をlocalStorageへ保存・読込し、壊れた項目だけを除外する', () => {
    const storage = memoryStorage()
    const saved = createSavedTopology('本線', tile(1), [], { width: 100, height: 80 })
    storeSavedTopologies([saved], storage)
    expect(loadSavedTopologies(storage)).toEqual([saved])
    storage.setItem(SAVED_TOPOLOGY_STORAGE_KEY, JSON.stringify([saved, { version: 99 }]))
    expect(loadSavedTopologies(storage)).toEqual([saved])
    storage.setItem(SAVED_TOPOLOGY_STORAGE_KEY, '{bad')
    expect(loadSavedTopologies(storage)).toEqual([])
    const unavailable = memoryStorage()
    unavailable.getItem = () => { throw new Error('blocked') }
    expect(loadSavedTopologies(unavailable)).toEqual([])
  })

  it('現在のトポロジへ再解決し、存在しない切断位置を数える', () => {
    const saved = createSavedTopology('本線', tile(1), [tile(2), tile(9)], { width: 100, height: 80 })
    expect(resolveSavedTopology(saved, [tile(1), tile(2)])).toMatchObject({
      seed: tile(1), cuts: [tile(2)], missingCuts: 1,
    })
    expect(resolveSavedTopology(saved, [tile(2)]).seed).toBeNull()
  })

  it('JSON形式とバージョンを検証し、安全な出力ファイル名を作る', () => {
    const saved = createSavedTopology('本線:東/西', tile(1), [], { width: 100, height: 80 })
    expect(parseSavedTopology(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(() => parseSavedTopology({ ...saved, version: 2 })).toThrow('未対応')
    expect(topologyExportFilename(saved.name)).toBe('simutrans-tid-topology-本線_東_西.json')
  })
})
