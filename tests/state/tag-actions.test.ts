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
  removePosition,
  replaceTree,
} from '@/state/actions'
import { ensureTag, forgetTag, pairTag, renameTag, unpairTag } from '@/state/tagActions'
import { tagOf, tagsFor, targetMissing } from '@/engine/tags'
import { fromLocal } from '@/engine/geo'
import { positionByKey, positions, treesAt } from '@/state/derived'
import { live } from '@/events/reduce'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state
const SERIAL = '04:A1:B2:C3:D4:E5:F6'
const ID = '04a1b2c3d4e5f6'

let rowId = ''

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
  const blockId = createBlock({ code: 'GH', name: 'Greenhouse', species: 'fig' })
  rowId = createRow(blockId, [at(0, 0), at(110, 0)], { by: 'count', count: 12 })
})

const liveIn = () => positions(s()).filter((p) => p.rowId === rowId)

describe('pairing a tag', () => {
  it('stores it under its serial, however the serial was typed', () => {
    const r = pairTag(SERIAL, { kind: 'tree', posKey: liveIn()[0]!.posKey })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.id).toBe(ID)
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'tree', posKey: liveIn()[0]!.posKey })
    expect(tagOf(s(), ID)?.pairedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('refuses something that is not a serial', () => {
    const r = pairTag('not a tag', { kind: 'farm' })
    expect(r.ok).toBe(false)
    expect(live.tags(s())).toHaveLength(0)
  })

  it('moves to another tree without a second tag appearing', () => {
    pairTag(SERIAL, { kind: 'tree', posKey: liveIn()[0]!.posKey })
    pairTag(SERIAL, { kind: 'tree', posKey: liveIn()[5]!.posKey })
    expect(live.tags(s())).toHaveLength(1)
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'tree', posKey: liveIn()[5]!.posKey })
  })

  it('unpairs without forgetting the tag, ready for the next tree', () => {
    pairTag(SERIAL, { kind: 'tree', posKey: liveIn()[0]!.posKey })
    unpairTag(ID)
    expect(tagOf(s(), ID)).toBeDefined()
    expect(tagOf(s(), ID)?.target).toBeUndefined()
    pairTag(ID, { kind: 'block', id: s().rows[rowId]!.blockId })
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'block', id: s().rows[rowId]!.blockId })
  })

  it('records a tag before anyone decides what it is on', () => {
    const r = ensureTag(SERIAL, 'blue sticker')
    expect(r.ok).toBe(true)
    expect(tagOf(s(), ID)?.name).toBe('blue sticker')
    expect(tagOf(s(), ID)?.target).toBeUndefined()
    // Seeing it again is not a second tag.
    ensureTag(SERIAL)
    expect(live.tags(s())).toHaveLength(1)
  })

  it('renames and forgets', () => {
    ensureTag(SERIAL)
    renameTag(ID, 'north gate')
    expect(tagOf(s(), ID)?.name).toBe('north gate')
    forgetTag(ID)
    expect(tagOf(s(), ID)).toBeUndefined()
    expect(live.tags(s())).toHaveLength(0)
  })

  it('lists the tags on a tree', () => {
    const key = liveIn()[2]!.posKey
    pairTag(SERIAL, { kind: 'tree', posKey: key })
    pairTag('aabbccddeeff', { kind: 'tree', posKey: key })
    expect(tagsFor(s(), { kind: 'tree', posKey: key })).toHaveLength(2)
    expect(tagsFor(s(), { kind: 'tree', posKey: liveIn()[0]!.posKey })).toHaveLength(0)
  })
})

describe('a tag through the changes that move a label', () => {
  it('still points at the same tree after the row is thinned', () => {
    const fourth = liveIn()[3]!
    pairTag(SERIAL, { kind: 'tree', posKey: fourth.posKey })
    expect(positionByKey(s()).get(fourth.posKey)!.label).toBe('GH-1-4')

    removePosition(liveIn()[0]!.posKey)

    // The tag is untouched, and the key it holds now carries a different number.
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'tree', posKey: fourth.posKey })
    expect(positionByKey(s()).get(fourth.posKey)!.label).toBe('GH-1-3')
    expect(targetMissing(s(), tagOf(s(), ID)!.target!)).toBe(false)
  })

  it('still points at the same tree after it dies and is regrafted to another variety', () => {
    const key = liveIn()[3]!.posKey
    pairTag(SERIAL, { kind: 'tree', posKey: key })
    const tree = currentTree(key)!
    const chicago = createVariety({ species: 'fig', name: 'Chicago Hardy' })

    addTreeEvent(tree.id, 'died', { date: '2026-03-01' })
    expect(currentTree(key)!.status).toBe('dead')
    addTreeEvent(tree.id, 'grafted', { date: '2027-05-01', varietyId: chicago })

    const now = currentTree(key)!
    expect(now.id).toBe(tree.id)
    expect(now.status).toBe('alive')
    expect(now.varietyId).toBe(chicago)
    // The tag never moved, and the label never moved either.
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'tree', posKey: key })
    expect(positionByKey(s()).get(key)!.label).toBe('GH-1-4')
  })

  it('still points at the same spot after the tree is replaced with a new one', () => {
    const key = liveIn()[3]!.posKey
    pairTag(SERIAL, { kind: 'tree', posKey: key })
    const old = currentTree(key)!
    const seedling = createVariety({ species: 'fig', name: 'Olympian' })
    replaceTree(key, { varietyId: seedling, date: '2027-04-01', how: 'planted' })

    const now = currentTree(key)!
    expect(now.id).not.toBe(old.id)
    expect(now.varietyId).toBe(seedling)
    // Both trees stay in the position's history, and the tag is on the position.
    expect(treesAt(s(), key)).toHaveLength(2)
    expect(tagOf(s(), ID)?.target).toEqual({ kind: 'tree', posKey: key })
    expect(targetMissing(s(), tagOf(s(), ID)!.target!)).toBe(false)
  })

  it('says so when its own spot is the one taken out', () => {
    const first = liveIn()[0]!
    pairTag(SERIAL, { kind: 'tree', posKey: first.posKey })
    removePosition(first.posKey)
    expect(targetMissing(s(), tagOf(s(), ID)!.target!)).toBe(true)
  })
})
