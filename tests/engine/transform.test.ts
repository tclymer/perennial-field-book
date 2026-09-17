// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  createBlock,
  createRow,
  moveBlock,
  nudgePosition,
  plantTree,
  setBlockOutline,
} from '@/state/actions'
import { movePoint } from '@/engine/transform'
import { distanceFt, fromLocal, toLocal } from '@/engine/geo'
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

describe('rigid move', () => {
  it('slides a point along and across a heading and turns it about a pivot', () => {
    const north = { headingDeg: 0, alongFt: 10, acrossFt: 5, rotateDeg: 0, pivot: ORIGIN }
    expect(toLocal(ORIGIN, movePoint(ORIGIN, north))).toEqual([
      expect.closeTo(5, 6),
      expect.closeTo(10, 6),
    ])
    const turned = { headingDeg: 0, alongFt: 0, acrossFt: 0, rotateDeg: 90, pivot: ORIGIN }
    // A point 10 ft north, turned 90° clockwise, ends 10 ft east.
    expect(toLocal(ORIGIN, movePoint(at(0, 10), turned))).toEqual([
      expect.closeTo(10, 6),
      expect.closeTo(0, 6),
    ])
  })

  it('moves rows, trees, nudges, and the outline together, keeping every record', () => {
    const block = createBlock({ code: 'B', name: 'b' })
    setBlockOutline(block, [at(0, 0), at(0, 100), at(40, 100), at(40, 0)])
    const row = createRow(block, [at(10, 10), at(10, 90)], { by: 'count', count: 9 })
    const tree = plantTree(`${row}:2`, {})
    nudgePosition(`${row}:5`, at(11, 51))
    const before = positions(s()).find((p) => p.posKey === `${row}:2`)!.coord
    const n = moveBlock(block, {
      headingDeg: 0,
      alongFt: 20,
      acrossFt: 3,
      rotateDeg: 0,
      pivot: at(20, 50),
    })
    expect(n).toBe(3)
    const after = positions(s()).find((p) => p.posKey === `${row}:2`)!.coord
    expect(distanceFt(before, after)).toBeCloseTo(Math.hypot(20, 3), 3)
    expect(s().trees[tree].posKey).toBe(`${row}:2`)
    expect(toLocal(ORIGIN, s().nudges[`${row}:5`])).toEqual([
      expect.closeTo(14, 4),
      expect.closeTo(71, 4),
    ])
    expect(toLocal(ORIGIN, s().blocks[block].outline![0])).toEqual([
      expect.closeTo(3, 4),
      expect.closeTo(20, 4),
    ])
    expect(
      moveBlock(block, { headingDeg: 0, alongFt: 0, acrossFt: 0, rotateDeg: 0, pivot: ORIGIN }),
    ).toBe(0)
  })
})
