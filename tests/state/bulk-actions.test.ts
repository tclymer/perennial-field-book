// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  assignVariety,
  commitEvents,
  completePlannedGraft,
  createBlock,
  createRow,
  createVariety,
  plantTree,
  planGrafts,
  unplanGrafts,
} from '@/state/actions'
import { currentTreeByPos } from '@/state/derived'
import { live } from '@/events/reduce'
import { planKey } from '@/model/types'
import { fromLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

let rowId = ''
let shen = ''
let wabash = ''
const key = (i: number) => `${rowId}:${i}`

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
  const block = createBlock({ status: 'planned', code: 'PP1', name: 'Pawpaws' })
  rowId = createRow(block, [at(0, 0), at(0, 90)], { by: 'count', count: 10 })
  shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
  wabash = createVariety({ species: 'pawpaw', name: 'Wabash' })
})

describe('bulk grid actions', () => {
  it('assigns a variety, planting where empty, and the inverse undoes it', () => {
    const existing = plantTree(key(1), { varietyId: shen })
    const inverse = assignVariety([key(1), key(2), key(3)], wabash)
    expect(s().trees[existing].varietyId).toBe(wabash)
    expect(currentTreeByPos(s()).get(key(2))?.varietyId).toBe(wabash)
    expect(inverse).toHaveLength(3)
    commitEvents(inverse)
    expect(s().trees[existing].varietyId).toBe(shen)
    expect(currentTreeByPos(s()).has(key(2))).toBe(false)
    expect(live.trees(s())).toHaveLength(1)
  })

  it('plans, clears, and completes grafts', () => {
    const inverse = planGrafts(2027, [key(4), key(5)], wabash)
    expect(s().plans[planKey(2027, key(4))]?.varietyId).toBe(wabash)
    expect(inverse.map((e) => e.type)).toEqual(['graft.unplan', 'graft.unplan'])
    // Re-planning the same thing is a no-op.
    expect(planGrafts(2027, [key(4)], wabash)).toEqual([])

    const cleared = unplanGrafts(2027, [key(5)])
    expect(s().plans[planKey(2027, key(5))]).toBeUndefined()
    commitEvents(cleared)
    expect(s().plans[planKey(2027, key(5))]?.varietyId).toBe(wabash)

    // An empty position gets a grafted tree; an occupied one gets a graft event.
    expect(completePlannedGraft(2027, key(4), '2027-04-12').ok).toBe(true)
    const t4 = currentTreeByPos(s()).get(key(4))!
    expect(t4.varietyId).toBe(wabash)
    expect(t4.graftedDate).toBe('2027-04-12')
    expect(s().plans[planKey(2027, key(4))]?.doneEventId).toBeDefined()

    const t5 = plantTree(key(5), { varietyId: shen, date: '2020-05-01' })
    expect(completePlannedGraft(2027, key(5), '2027-04-12').ok).toBe(true)
    expect(s().trees[t5].varietyId).toBe(wabash)
    expect(live.treeEvents(s(), t5).map((e) => e.kind)).toEqual(['planted', 'grafted'])
    expect(completePlannedGraft(2028, key(5)).ok).toBe(false)
  })
})
