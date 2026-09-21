// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, getSync, mergeEvents, putSync } from '@/events/db'
import { resetStoreForTests, useFarmStore, whenWritten } from '@/state/store'
import { createBlock, createRow, removePositions } from '@/state/actions'
import { positions, slots } from '@/state/derived'
import { linkFarm, pull, repullHistory, resetEngineForTests } from '@/sync/engine'
import { resetSyncForTests, useSync } from '@/sync/store'
import type { AnyEvent } from '@/events/types'
import { fromLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'
import { fakeServer, type FakeServer } from './fakeServer'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
let server: FakeServer

beforeEach(async () => {
  await Promise.all(
    [db.events, db.photos, db.outbox, db.photoOutbox, db.sync].map((t) => t.clear()),
  )
  localStorage.clear()
  resetStoreForTests()
  resetSyncForTests()
  resetEngineForTests()
  server = fakeServer()
  server.install()
  useSync.getState().setSession({
    token: 'tok_test',
    user: { id: 'usr_1', email: 'tim@example.com', name: 'Tim', picture: null },
  })
})

afterEach(() => server.uninstall())

const s = () => useFarmStore.getState().state

describe('a device that stored an event with a field stripped out of it', () => {
  it('shows trees the others do not, and fetching again repairs it', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const blockId = createBlock({ code: 'GRH', name: 'Greenhouse', species: 'fig' })
    const rowId = createRow(blockId, [at(0, 0), at(110, 0)], { by: 'count', count: 12 })
    const live = () => positions(s()).filter((p) => p.rowId === rowId)
    removePositions(
      live()
        .slice(0, 8)
        .map((p) => p.posKey),
    )
    await whenWritten()
    await linkFarm()
    expect(live()).toHaveLength(4)

    // What an older build did on pull: the payload it could not describe came back stripped,
    // and that is what went into storage. Here, the skips are dropped from the stored copy.
    const stored = await db.events.where('farmId').equals(farmId).toArray()
    const patches = stored.filter((e) => e.type === 'row.patch')
    expect(patches.length).toBeGreaterThan(0)
    await mergeEvents(
      patches.map((e) => ({ ...e, payload: { id: rowId } }) as AnyEvent),
      { outbox: false },
    )
    await useFarmStore.getState().reload()

    // Exactly Tim's report: the phone still draws trees the desktop does not.
    expect(positions(s()).filter((p) => p.rowId === rowId)).toHaveLength(12)
    expect(slots(s()).filter((p) => p.skipped)).toHaveLength(0)

    // The server still holds the events as they were made.
    const link = (await getSync(farmId))!
    await putSync({ ...link, cursor: 0 })
    const received = await repullHistory()
    expect(received).toBeGreaterThan(0)

    expect(positions(s()).filter((p) => p.rowId === rowId)).toHaveLength(4)
    expect(s().rows[rowId]?.skips).toHaveLength(8)
  })

  it('keeps an event it cannot describe, and applies it once the build catches up', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    createBlock({ code: 'PP1', name: 'Pawpaws' })
    await whenWritten()
    await linkFarm()

    // What a newer build would send: a kind of feature this one has no name for.
    server.receive(farmId, {
      id: 'evt_future',
      farmId,
      deviceId: 'other-device',
      ts: Date.now(),
      type: 'feature.create',
      payload: {
        id: 'ftr_nursery',
        name: 'Nursery bed',
        kind: 'nursery',
        geometry: { type: 'Point', coordinates: ORIGIN },
      },
    } as never)

    const link = (await getSync(farmId))!
    await pull(link)
    await useFarmStore.getState().reload()

    // Not acted on, but not thrown away either, and the app can say so.
    expect(s().features['ftr_nursery']).toBeUndefined()
    expect(s().beyond).toBe(1)
    expect(await db.events.get('evt_future')).toBeDefined()
    expect(((await db.events.get('evt_future'))!.payload as Record<string, unknown>).kind).toBe(
      'nursery',
    )
  })

  it('leaves work that has not gone up alone', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    createBlock({ code: 'PP1', name: 'Pawpaws' })
    await whenWritten()
    await linkFarm()

    // Made after the link, and the server is unreachable, so it is still waiting to go up.
    server.mode = 'offline'
    const later = createBlock({ code: 'PER', name: 'Persimmons' })
    await whenWritten()

    server.mode = 'ok'
    await repullHistory()
    expect(s().blocks[later]?.code).toBe('PER')
    expect(await db.outbox.count()).toBeGreaterThan(0)
    void farmId
  })
})
