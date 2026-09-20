// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  commitEvents,
  createBlock,
  createRow,
  currentTree,
  removePosition,
  removePositions,
  restorePosition,
  restorePositions,
  setRowLayout,
} from '@/state/actions'
import { addHarvest } from '@/state/harvestActions'
import { boxLabel } from '@/engine/harvest'
import { fromLocal } from '@/engine/geo'
import { positionByKey, positionByLabel, positions, slots } from '@/state/derived'
import { live } from '@/events/reduce'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

let blockId = ''
let rowId = ''

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
  blockId = createBlock({ code: 'GH', name: 'Greenhouse', species: 'fig' })
  rowId = createRow(blockId, [at(0, 0), at(110, 0)], { by: 'count', count: 12 })
})

const liveIn = () => positions(s()).filter((p) => p.rowId === rowId)

describe('taking a spot out of a row', () => {
  it('records the tree as removed and moves the rest up a number', () => {
    const third = liveIn()[2]
    const fourthTreeId = currentTree(liveIn()[3].posKey)!.id
    expect(removePosition(third.posKey).ok).toBe(true)

    expect(liveIn()).toHaveLength(11)
    // The tree that was fourth is now third, and it is the same tree record.
    expect(currentTree(liveIn()[2].posKey)!.id).toBe(fourthTreeId)
    expect(liveIn()[2].label).toBe('GH-1-3')
    expect(currentTree(third.posKey)!.status).toBe('removed')
  })

  it('refuses to take the same spot out twice', () => {
    const key = liveIn()[0].posKey
    expect(removePosition(key).ok).toBe(true)
    const again = removePosition(key)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.reason).toMatch(/already out/i)
  })

  it('puts a spot back in its own place', () => {
    const third = liveIn()[2]
    removePosition(third.posKey)
    expect(restorePosition(third.posKey).ok).toBe(true)
    expect(liveIn()).toHaveLength(12)
    expect(positionByKey(s()).get(third.posKey)!.index).toBe(3)
    expect(positionByKey(s()).get(third.posKey)!.label).toBe('GH-1-3')
  })

  it('keeps a harvest recorded before the tree went, and still says where it came from', () => {
    const third = liveIn()[2]
    addHarvest({ crop: 'fig', date: '2026-09-01', quantity: 4, unit: 'lb', posKey: third.posKey })
    removePosition(third.posKey)

    const h = live.harvests(s())[0]!
    expect(h.quantity).toBe(4)
    // The label is marked so it cannot be read as the tree that now carries number three.
    expect(boxLabel(s(), h)).toContain('GH-1-3 (removed)')
    expect(positionByLabel(s()).get('GH-1-3')!.posKey).not.toBe(third.posKey)
  })

  it('leaves a taken-out label out of the lookup, so a link never lands on it', () => {
    const third = liveIn()[2]
    removePosition(third.posKey)
    const found = positionByLabel(s()).get('GH-1-3 (REMOVED)')
    expect(found).toBeUndefined()
  })

  it('thins a row in one go and undoes it', () => {
    const before = liveIn().map((p) => p.posKey)
    const drop = liveIn()
      .filter((p) => p.index % 2 === 0)
      .map((p) => p.posKey)
    const inverse = removePositions(drop)
    expect(liveIn()).toHaveLength(6)
    expect(liveIn().map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6])

    commitEvents(inverse)
    expect(liveIn()).toHaveLength(12)
    expect(liveIn().map((p) => p.posKey)).toEqual(before)
    // Undo also takes back the removals recorded against those trees.
    expect(live.trees(s()).every((t) => t.status === 'alive')).toBe(true)
  })

  it('puts several spots back at once', () => {
    const drop = liveIn()
      .filter((p) => p.index <= 3)
      .map((p) => p.posKey)
    removePositions(drop)
    expect(liveIn()).toHaveLength(9)
    restorePositions(drop)
    expect(liveIn()).toHaveLength(12)
    expect(slots(s()).filter((p) => p.skipped)).toHaveLength(0)
  })

  it('lets the row be shortened once the end spots are out', () => {
    const tail = liveIn()
      .filter((p) => p.index > 6)
      .map((p) => p.posKey)
    // The trees at the end block a shorter row while they still hold their spots.
    expect(setRowLayout(rowId, { by: 'count', count: 6 }).ok).toBe(false)
    removePositions(tail)
    expect(setRowLayout(rowId, { by: 'count', count: 6 }).ok).toBe(true)
  })
})
