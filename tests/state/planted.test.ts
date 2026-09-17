// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  createBlock,
  createLoosePosition,
  createRow,
  createVariety,
  plantTree,
  setBlockStatus,
  setRowDefaultVariety,
  setRowLayout,
} from '@/state/actions'
import { currentTreeByPos, positions } from '@/state/derived'
import { live } from '@/events/reduce'
import { fromLocal } from '@/engine/geo'
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

describe('planted and planned blocks', () => {
  it('a planted block records a tree at every position as rows are drawn or grow', () => {
    const b = createBlock({ code: 'B', name: 'b' })
    const row = createRow(b, [at(0, 0), at(0, 90)], { by: 'count', count: 10 })
    expect(live.trees(s())).toHaveLength(10)
    expect(setRowLayout(row, { by: 'count', count: 12 }).ok).toBe(true)
    expect(live.trees(s())).toHaveLength(12)
    createLoosePosition(b, at(50, 50))
    expect(live.trees(s())).toHaveLength(13)
    // Setting the row default gives it to trees without one; an explicit variety is kept.
    const shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
    const wabash = createVariety({ species: 'pawpaw', name: 'Wabash' })
    const t3 = currentTreeByPos(s()).get(`${row}:3`)!
    useFarmStore
      .getState()
      .commit([{ type: 'tree.patch', payload: { id: t3.id, varietyId: wabash } }])
    setRowDefaultVariety(row, shen)
    expect(currentTreeByPos(s()).get(`${row}:1`)?.varietyId).toBe(shen)
    expect(currentTreeByPos(s()).get(`${row}:3`)?.varietyId).toBe(wabash)
  })

  it('a planned block records nothing until it is marked planted', () => {
    const b = createBlock({ code: 'P', name: 'p', status: 'planned' })
    const row = createRow(b, [at(0, 0), at(0, 90)], { by: 'count', count: 10 })
    const shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
    setRowDefaultVariety(row, shen)
    expect(live.trees(s())).toHaveLength(0)
    expect(positions(s())).toHaveLength(10)
    plantTree(`${row}:2`, { varietyId: shen, date: '2024-04-01' })
    const n = setBlockStatus(b, 'planted', 2026)
    expect(n).toBe(9)
    expect(live.trees(s())).toHaveLength(10)
    expect(currentTreeByPos(s()).get(`${row}:1`)?.plantedDate).toBe('2026-01-01')
    expect(currentTreeByPos(s()).get(`${row}:2`)?.plantedDate).toBe('2024-04-01')
  })
})
