// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { applyRelayout, createBlock, fillBlock, plantTree } from '@/state/actions'
import { fillOutline } from '@/engine/fill'
import { orphanKeys, planRelayout } from '@/engine/relayout'
import { fromLocal } from '@/engine/geo'
import { positions } from '@/state/derived'
import { live } from '@/events/reduce'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state
const base = {
  headingDeg: 0,
  rowSpacingFt: 20,
  treeSpacingFt: 10,
  insetFt: 10,
  pattern: 'square' as const,
}

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
})

describe('relayout', () => {
  it('keeps row identities and reports what moves when the outline grows', () => {
    const block = createBlock({ status: 'planned', code: 'B', name: 'b' })
    const rect = [at(0, 0), at(0, 200), at(100, 200), at(100, 0)]
    fillBlock(block, fillOutline(rect, base), base)
    const rows = live.rows(s()).filter((r) => r.blockId === block)
    expect(rows).toHaveLength(5)
    const row1 = rows.find((r) => r.number === 1)!
    plantTree(`${row1.id}:3`, {})
    plantTree(`${row1.id}:19`, {})

    // Longer outline: same rows, more trees each; nothing moves.
    const longer = [at(0, 0), at(0, 240), at(100, 240), at(100, 0)]
    const plan = planRelayout(s(), block, fillOutline(longer, base), 20, 10)
    expect(plan.updates).toHaveLength(5)
    expect(plan.creates).toHaveLength(0)
    expect(plan.deletes).toHaveLength(0)
    expect(plan).toMatchObject({ stays: 2, moves: 0, orphans: 0 })
    expect(plan.updates.find((u) => u.rowId === row1.id)?.count).toBe(23)

    // Wider outline adds a row; shorter rows orphan the tree at position 19.
    const wider = [at(0, 0), at(0, 150), at(120, 150), at(120, 0)]
    const plan2 = planRelayout(s(), block, fillOutline(wider, base), 20, 10)
    expect(plan2.creates).toHaveLength(1)
    expect(plan2).toMatchObject({ stays: 1, orphans: 1 })
    expect(orphanKeys(plan2)).toEqual([`${row1.id}:19`])

    // A shift along the rows moves the trees but keeps their labels.
    const shifted = fillOutline(rect, { ...base, shiftAlongFt: 6 })
    const plan3 = planRelayout(s(), block, shifted, 20, 10)
    // Position 3 moves 6 ft; position 19 no longer fits and is orphaned.
    expect(plan3).toMatchObject({ moves: 1, stays: 0, orphans: 1 })

    applyRelayout(block, plan, base)
    const after = live.rows(s()).filter((r) => r.blockId === block)
    expect(after.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort())
    expect(positions(s()).filter((p) => p.rowId === row1.id)).toHaveLength(23)
    expect(s().trees[Object.keys(s().trees)[0]].posKey).toBe(`${row1.id}:3`)
  })

  it('removes unmatched empty rows and keeps unmatched planted ones', () => {
    const block = createBlock({ status: 'planned', code: 'B', name: 'b' })
    const rect = [at(0, 0), at(0, 200), at(100, 200), at(100, 0)]
    fillBlock(block, fillOutline(rect, base), base)
    const rows = live
      .rows(s())
      .filter((r) => r.blockId === block)
      .sort((a, b) => a.number - b.number)
    plantTree(`${rows[4].id}:1`, {})
    // Narrower outline: the last two rows have no new counterpart.
    const narrower = [at(0, 0), at(0, 200), at(60, 200), at(60, 0)]
    const plan = planRelayout(s(), block, fillOutline(narrower, base), 20, 10)
    expect(plan.updates).toHaveLength(3)
    expect(plan.deletes).toEqual([rows[3].id])
    expect(plan.kept).toEqual([rows[4].id])
    applyRelayout(block, plan, base)
    expect(live.rows(s()).filter((r) => r.blockId === block)).toHaveLength(4)
  })
})
