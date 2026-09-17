// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  autoNumberRows,
  codeAvailable,
  createBlock,
  createFeature,
  createLoosePosition,
  createRow,
  createVariety,
  nudgePosition,
  reverseRow,
  setRowLayout,
  setRowNumber,
  updateRowPolyline,
} from '@/state/actions'
import { fromLocal } from '@/engine/geo'
import { positions } from '@/state/derived'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
})

describe('blocks and rows', () => {
  it('creates a block with an upper-case code and numbers rows as they are drawn', () => {
    const id = createBlock({ code: 'pp1', name: 'Pawpaws', inRowSpacingFt: 11 })
    expect(s().blocks[id].code).toBe('PP1')
    expect(codeAvailable('PP1')).toBe(false)
    expect(codeAvailable('pp1', id)).toBe(true)
    const r1 = createRow(id, [at(0, 0), at(0, 220)])
    const r2 = createRow(id, [at(16, 0), at(16, 220)])
    expect(s().rows[r1].number).toBe(1)
    expect(s().rows[r2].number).toBe(2)
    // The block's tree spacing becomes the default layout.
    expect(s().rows[r1].layout).toEqual({ by: 'spacing', spacingFt: 11 })
    expect(positions(s()).filter((p) => p.rowId === r1)).toHaveLength(21)
  })

  it('guesses a count for a block without spacing', () => {
    const id = createBlock({ code: 'X', name: 'x' })
    const r = createRow(id, [at(0, 0), at(150, 0)])
    expect(s().rows[r].layout).toEqual({ by: 'count', count: 11 })
  })

  it('refuses to drop a position that holds a tree', () => {
    const id = createBlock({ code: 'X', name: 'x' })
    const r = createRow(id, [at(0, 0), at(90, 0)], { by: 'count', count: 10 })
    useFarmStore
      .getState()
      .commit([{ type: 'tree.create', payload: { id: 'tree_1', posKey: `${r}:8` } }])
    const refused = setRowLayout(r, { by: 'count', count: 5 })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toMatch(/Position 8/)
    expect(setRowLayout(r, { by: 'count', count: 8 }).ok).toBe(true)
    // Shortening a spacing row is refused the same way.
    expect(setRowLayout(r, { by: 'spacing', spacingFt: 10 }).ok).toBe(true)
    expect(updateRowPolyline(r, [at(0, 0), at(40, 0)]).ok).toBe(false)
    expect(updateRowPolyline(r, [at(0, 0), at(95, 0)]).ok).toBe(true)
  })

  it('reverses an empty row and clears its nudges, but not a planted one', () => {
    const id = createBlock({ code: 'X', name: 'x' })
    const r = createRow(id, [at(0, 0), at(90, 0)], { by: 'count', count: 4 })
    nudgePosition(`${r}:2`, at(31, 1))
    expect(s().nudges[`${r}:2`]).toBeDefined()
    expect(reverseRow(r).ok).toBe(true)
    expect(s().rows[r].polyline[0]).toEqual(at(90, 0))
    expect(s().nudges[`${r}:2`]).toBeUndefined()
    useFarmStore
      .getState()
      .commit([{ type: 'tree.create', payload: { id: 'tree_1', posKey: `${r}:1` } }])
    expect(reverseRow(r).ok).toBe(false)
  })

  it('swaps numbers when one is taken, and renumbers along the block side', () => {
    const id = createBlock({
      code: 'X',
      name: 'x',
      numbering: { rowsFrom: 'W', positionsFrom: '' },
    })
    const a = createRow(id, [at(0, 0), at(0, 100)])
    const b = createRow(id, [at(16, 0), at(16, 100)])
    const c = createRow(id, [at(32, 0), at(32, 100)])
    setRowNumber(c, 1)
    expect(s().rows[c].number).toBe(1)
    expect(s().rows[a].number).toBe(3)
    // From the west, a comes first again: two rows change, b stays.
    expect(autoNumberRows(id)).toBe(2)
    expect([s().rows[a].number, s().rows[b].number, s().rows[c].number]).toEqual([1, 2, 3])
    expect(autoNumberRows(id)).toBe(0)
  })
})

describe('loose positions, features, varieties', () => {
  it('numbers loose positions per block and records features and varieties', () => {
    const y = createBlock({ code: 'Y', name: 'Yard' })
    const p1 = createLoosePosition(y, at(5, 5))
    const p2 = createLoosePosition(y, at(50, 5))
    expect(s().loosePositions[p1].number).toBe(1)
    expect(s().loosePositions[p2].number).toBe(2)
    expect(positions(s()).map((p) => p.label)).toEqual(['Y-1', 'Y-2'])
    const f = createFeature('Blue House', 'greenhouse', { type: 'Point', coordinates: at(80, 80) })
    expect(s().features[f].kind).toBe('greenhouse')
    const v = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
    expect(s().varieties[v].name).toBe('Shenandoah')
  })
})
