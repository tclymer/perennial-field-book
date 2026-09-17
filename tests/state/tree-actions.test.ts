// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import {
  addTreeEvent,
  createBlock,
  createRow,
  createVariety,
  currentTree,
  plantTree,
  replaceTree,
  today,
} from '@/state/actions'
import { currentTreeByPos, treesAt, varietyAt, positions } from '@/state/derived'
import { live } from '@/events/reduce'
import { fromLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

let rowId = ''
let shen = ''
let wabash = ''

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

describe('tree actions', () => {
  it('plants a tree with a dated history entry', () => {
    const key = `${rowId}:3`
    const id = plantTree(key, { varietyId: shen, date: '2019-05-01' })
    const t = s().trees[id]
    expect(t.status).toBe('alive')
    expect(t.plantedDate).toBe('2019-05-01')
    expect(live.treeEvents(s(), id).map((e) => e.kind)).toEqual(['planted'])
    expect(currentTreeByPos(s()).get(key)?.id).toBe(id)
    const p = positions(s()).find((p) => p.posKey === key)!
    expect(varietyAt(s(), p)?.name).toBe('Shenandoah')
  })

  it('records a graft and the tree changes variety', () => {
    const key = `${rowId}:3`
    const id = plantTree(key, { varietyId: shen, date: '2019-05-01' })
    addTreeEvent(id, 'grafted', { date: '2025-04-10', varietyId: wabash })
    expect(s().trees[id].varietyId).toBe(wabash)
    expect(s().trees[id].graftedDate).toBe('2025-04-10')
    addTreeEvent(id, 'scionwood', { note: '12 sticks for the exchange' })
    const events = live.treeEvents(s(), id)
    expect(events.at(-1)?.kind).toBe('scionwood')
    expect(events.at(-1)?.date).toBe(today())
  })

  it('replaces a living tree, keeping the old one as removed', () => {
    const key = `${rowId}:3`
    const old = plantTree(key, { varietyId: shen, date: '2019-05-01' })
    const fresh = replaceTree(key, { varietyId: wabash, date: '2028-04-01', how: 'grafted' })
    expect(s().trees[old].status).toBe('removed')
    expect(live.treeEvents(s(), old).map((e) => e.kind)).toEqual(['planted', 'removed'])
    expect(s().trees[fresh].graftedDate).toBe('2028-04-01')
    expect(currentTree(key)?.id).toBe(fresh)
    expect(treesAt(s(), key).map((t) => t.id)).toEqual([fresh, old])
  })

  it('does not double-mark a dead tree when replacing it', () => {
    const key = `${rowId}:4`
    const old = plantTree(key, { varietyId: shen })
    addTreeEvent(old, 'died', { date: '2026-02-01' })
    replaceTree(key, { varietyId: wabash })
    expect(live.treeEvents(s(), old).map((e) => e.kind)).toEqual(['died'])
    expect(s().trees[old].status).toBe('dead')
  })
})
