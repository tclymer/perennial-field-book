// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, mergeEvents, outboxCount, outboxEvents, putSync } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore, whenWritten } from '@/state/store'
import { createBlock, updateBlock } from '@/state/actions'
import type { AnyEvent } from '@/events/types'

const ORIGIN: [number, number] = [-77.083, 40.1794]

beforeEach(async () => {
  await Promise.all(
    [db.events, db.photos, db.outbox, db.photoOutbox, db.sync].map((t) => t.clear()),
  )
  localStorage.clear()
  resetStoreForTests()
})

describe('outbox bookkeeping', () => {
  it('holds what this device recorded or imported, never what was pulled', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const blockId = createBlock({ code: 'PP1', name: 'Pawpaws' })
    await whenWritten()
    expect(await outboxCount(farmId)).toBe(2)
    const pulled: AnyEvent = {
      id: 'evt_pulled',
      farmId,
      deviceId: 'dev_b',
      ts: 5,
      type: 'block.patch',
      payload: { id: blockId, name: 'Pulled' },
    }
    await mergeEvents([pulled], { outbox: false })
    expect(await outboxCount(farmId)).toBe(2)
    expect((await outboxEvents(farmId, 10)).map((e) => e.type)).toEqual([
      'farm.create',
      'block.create',
    ])

    // A file import from another device is local from the server's point of view.
    const imported: AnyEvent = { ...pulled, id: 'evt_imported', ts: 6 }
    await useFarmStore.getState().importLog(farmId, [imported])
    expect(await outboxCount(farmId)).toBe(3)

    // Deleting the farm locally clears its bookkeeping.
    await putSync({ farmId, cursor: 3, linkedAt: 1 })
    await useFarmStore.getState().deleteFarm()
    expect(await outboxCount(farmId)).toBe(0)
    expect(await db.sync.count()).toBe(0)
  })

  it('reload re-materializes in full order so older pulled events do not win', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const blockId = createBlock({ code: 'PP1', name: 'Pawpaws' })
    await new Promise((r) => setTimeout(r, 5))
    updateBlock(blockId, { name: 'Ours' })
    await whenWritten()
    const older: AnyEvent = {
      id: 'evt_older',
      farmId,
      deviceId: 'dev_b',
      ts: useFarmStore.getState().state.lastTs - 1,
      type: 'block.patch',
      payload: { id: blockId, name: 'Theirs' },
    }
    await mergeEvents([older], { outbox: false })
    await useFarmStore.getState().reload()
    expect(live.blocks(useFarmStore.getState().state)[0]?.name).toBe('Ours')
    expect(useFarmStore.getState().state.applied).toBe(4)
  })
})
