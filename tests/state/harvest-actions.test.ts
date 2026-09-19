// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createVariety } from '@/state/actions'
import { addHarvest, deleteHarvest, setUnit, updateHarvest } from '@/state/harvestActions'
import { createPerson, setCurrentPerson } from '@/state/people'
import { sessionOf } from '@/engine/harvest'
import { useDevice } from '@/state/device'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const s = () => useFarmStore.getState().state

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  useDevice.getState().set({ personId: null })
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
})

describe('harvest entries', () => {
  it('numbers boxes per day and crop, fills the unit, and names the picker', () => {
    const tim = createPerson('Tim')
    setCurrentPerson(tim)
    const shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
    const block = createBlock({ code: 'PP1', name: 'Pawpaws', species: 'pawpaw' })

    const a = addHarvest({ crop: 'pawpaw', varietyId: shen, blockId: block, quantity: 11.5 })
    const b = addHarvest({ crop: 'Pawpaws', quantity: 8, date: undefined })
    expect(s().harvests[a]).toMatchObject({
      crop: 'pawpaw',
      unit: 'lb',
      box: 1,
      quantity: 11.5,
      personIds: [tim],
    })
    // The crop is stored in its plain form, and the box number continues.
    expect(s().harvests[b]).toMatchObject({ crop: 'pawpaws', box: 1 })
    const c = addHarvest({ crop: 'pawpaw', quantity: 9 })
    expect(s().harvests[c]?.box).toBe(2)

    // Figs count half pints, and another day starts at one again.
    const fig = addHarvest({ crop: 'fig', quantity: 30, date: '2026-09-01' })
    expect(s().harvests[fig]).toMatchObject({ unit: 'half pint', box: 1 })
    expect(sessionOf(s(), '2026-09-01', 'fig').totals).toEqual([
      { unit: 'half pint', quantity: 30, boxes: 1 },
    ])
  })

  it('keeps the unit an entry was made with when the farm changes its mind', () => {
    const first = addHarvest({ crop: 'fig', quantity: 20 })
    expect(s().harvests[first]?.unit).toBe('half pint')
    setUnit('fig', 'pint')
    const second = addHarvest({ crop: 'fig', quantity: 10 })
    expect(s().harvests[first]?.unit).toBe('half pint')
    expect(s().harvests[second]?.unit).toBe('pint')
    expect(s().farm?.units).toEqual({ fig: 'pint' })
  })

  it('edits and deletes an entry', () => {
    const id = addHarvest({ crop: 'pawpaw', quantity: 10 })
    updateHarvest(id, { quantity: 12, notes: 'wet' })
    expect(s().harvests[id]).toMatchObject({ quantity: 12, notes: 'wet' })
    deleteHarvest(id)
    expect(live.harvests(s())).toHaveLength(0)
    expect(s().harvests[id]?.deleted).toBe(true)
  })
})
