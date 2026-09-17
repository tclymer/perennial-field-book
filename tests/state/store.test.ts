// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { readActiveFarmId, resetStoreForTests, useFarmStore, whenWritten } from '@/state/store'

beforeEach(async () => {
  await db.events.clear()
  await db.photos.clear()
  localStorage.clear()
  resetStoreForTests()
})

describe('farm store', () => {
  it('creates a farm, commits events, and reads them back after a reload', async () => {
    const s = useFarmStore.getState()
    const farmId = await s.createFarm('Threefold', [-77.083, 40.179], 17)
    expect(readActiveFarmId()).toBe(farmId)
    const stamped = useFarmStore.getState().commit([
      {
        type: 'block.create',
        payload: {
          id: 'blk_1',
          code: 'PP1',
          name: 'Pawpaws',
          numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
        },
      },
      { type: 'block.patch', payload: { id: 'blk_1', notes: 'trial' } },
    ])
    expect(stamped[1].ts).toBeGreaterThan(stamped[0].ts)
    expect(stamped[0].farmId).toBe(farmId)
    expect(useFarmStore.getState().state.blocks.blk_1.notes).toBe('trial')
    await whenWritten()

    resetStoreForTests()
    await useFarmStore.getState().hydrate()
    const after = useFarmStore.getState()
    expect(after.hydrated).toBe(true)
    expect(after.farmId).toBe(farmId)
    expect(after.state.farm?.name).toBe('Threefold')
    expect(after.state.blocks.blk_1.notes).toBe('trial')
    expect(after.state.applied).toBe(3)
  })

  it('refuses to commit without an open farm and validates payloads', async () => {
    expect(() =>
      useFarmStore.getState().commit([{ type: 'farm.patch', payload: { name: 'x' } }]),
    ).toThrow(/No farm/)
    await useFarmStore.getState().createFarm('F', [0, 0], 10)
    expect(() =>
      useFarmStore.getState().commit([
        {
          type: 'block.create',
          payload: { id: 'blk_1', code: 'bad code', name: 'x' } as never,
        },
      ]),
    ).toThrow()
  })

  it('hydrates to no farm when the stored id points at nothing', async () => {
    localStorage.setItem('fieldbook:activeFarmId', 'farm_gone')
    await useFarmStore.getState().hydrate()
    expect(useFarmStore.getState().farmId).toBeNull()
    expect(readActiveFarmId()).toBeNull()
  })

  it('deletes the open farm from storage', async () => {
    const farmId = await useFarmStore.getState().createFarm('F', [0, 0], 10)
    await useFarmStore.getState().deleteFarm()
    expect(await db.events.where('farmId').equals(farmId).count()).toBe(0)
    expect(useFarmStore.getState().farmId).toBeNull()
  })
})
