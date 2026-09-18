// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, getSync, outboxCount } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore, whenWritten } from '@/state/store'
import { createBlock, updateBlock } from '@/state/actions'
import { addPhoto, photoUrl } from '@/state/photos'
import { deviceId } from '@/state/device'
import { linkFarm, openRemoteFarm, resetEngineForTests, syncNow, unlinkFarm } from '@/sync/engine'
import { resetSyncForTests, useSync } from '@/sync/store'
import { fakeServer, type FakeServer } from './fakeServer'

const ORIGIN: [number, number] = [-77.083, 40.1794]
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

const state = () => useFarmStore.getState().state

describe('sync engine', () => {
  it('pushes the whole local log when a farm is linked, then only new changes', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const blockId = createBlock({ code: 'PP1', name: 'Pawpaws' })
    await whenWritten()
    expect(await outboxCount(farmId)).toBe(2)

    await linkFarm()
    expect(server.farms.get(farmId)?.name).toBe('Threefold')
    expect(server.events.map((r) => r.event.type)).toEqual(['farm.create', 'block.create'])
    expect(await outboxCount(farmId)).toBe(0)
    const sync = useSync.getState()
    expect(sync.linked).toBe(true)
    expect(sync.phase).toBe('idle')
    expect(sync.pending).toBe(0)
    expect(sync.lastSyncAt).not.toBeNull()
    // The pull cursor moved past what we pushed ourselves.
    expect((await getSync(farmId))?.cursor).toBe(2)

    updateBlock(blockId, { name: 'Pawpaws east' })
    await whenWritten()
    server.calls.length = 0
    await syncNow('write')
    expect(server.events).toHaveLength(3)
    expect(server.calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    // Nothing came back that we did not already have.
    expect(live.blocks(state())[0]?.name).toBe('Pawpaws east')
  })

  it('pulls another device changes and keeps last-writer-wins by timestamp', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const blockId = createBlock({ code: 'PP1', name: 'Pawpaws', species: 'pawpaw' })
    await whenWritten()
    await linkFarm()

    // Another device patched the name earlier than our own later patch, and the species
    // later than anything we did.
    await new Promise((r) => setTimeout(r, 5))
    updateBlock(blockId, { name: 'Ours' })
    await whenWritten()
    const theirTs = state().lastTs
    server.receive(farmId, {
      id: 'evt_theirs_1',
      farmId,
      deviceId: 'dev_b',
      ts: theirTs - 1,
      type: 'block.patch',
      payload: { id: blockId, name: 'Theirs' },
    })
    server.receive(farmId, {
      id: 'evt_theirs_2',
      farmId,
      deviceId: 'dev_b',
      ts: theirTs + 1000,
      type: 'block.patch',
      payload: { id: blockId, species: 'persimmon' },
    })
    await syncNow('timer')
    const block = live.blocks(state())[0]!
    expect(block.name).toBe('Ours')
    expect(block.species).toBe('persimmon')
    // Pulled events are stored but never pushed back.
    expect(await outboxCount(farmId)).toBe(0)
    expect(await db.events.count()).toBe(5)
    expect(useSync.getState().pending).toBe(0)
  })

  it('uploads photos it took and fetches ones it lacks', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    const id = await addPhoto(farmId, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    expect(id).not.toBeNull()
    await linkFarm()
    expect(useSync.getState().error).toBeNull()
    expect(server.calls.find((c) => c.method === 'PUT')).toMatchObject({
      path: `/api/farms/${farmId}/photos/${id}`,
      contentType: 'image/jpeg',
    })
    expect(server.photos.has(id!)).toBe(true)
    expect(await db.photoOutbox.count()).toBe(0)

    server.photos.set('pho_remote', { mime: 'image/png', bytes: new Uint8Array([9, 9]) })
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test'
    expect(await photoUrl('pho_remote')).toMatch(/^blob:/)
    expect((await db.photos.get('pho_remote'))?.mime).toBe('image/png')
    expect(await db.photoOutbox.count()).toBe(0)
  })

  it('opens a farm from the server onto an empty device', async () => {
    const farmId = 'farm_remote'
    server.farms.set(farmId, { name: 'Remote', members: new Set(['usr_1']) })
    server.receive(farmId, {
      id: 'evt_r1',
      farmId,
      deviceId: 'dev_b',
      ts: 1000,
      type: 'farm.create',
      payload: { id: farmId, name: 'Remote', center: ORIGIN, zoom: 17 },
    })
    server.receive(farmId, {
      id: 'evt_r2',
      farmId,
      deviceId: 'dev_b',
      ts: 1001,
      type: 'block.create',
      payload: {
        id: 'blk_1',
        code: 'A',
        name: 'Apples',
        numbering: { rowsFrom: 'N', positionsFrom: 'x' },
      },
    })
    expect(await openRemoteFarm(farmId)).toBe(true)
    expect(useFarmStore.getState().farmId).toBe(farmId)
    expect(live.blocks(state()).map((b) => b.code)).toEqual(['A'])
    expect(await outboxCount(farmId)).toBe(0)
    // A change here goes up under this device's id.
    createBlock({ code: 'B', name: 'Pears' })
    await whenWritten()
    await syncNow('write')
    expect(server.events.at(-1)?.event.deviceId).toBe(deviceId())

    server.farms.set('farm_empty', { name: 'Empty', members: new Set(['usr_1']) })
    expect(await openRemoteFarm('farm_empty')).toBe(false)
  })

  it('reports offline, lost access, and expired sign-in without losing anything', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    await linkFarm()
    createBlock({ code: 'PP1', name: 'Pawpaws' })
    await whenWritten()

    server.mode = 'offline'
    await syncNow('manual')
    expect(useSync.getState().phase).toBe('offline')
    expect(useSync.getState().pending).toBe(1)
    // Automatic retries wait; a manual one goes straight through.
    server.mode = 'ok'
    await syncNow('timer')
    expect(useSync.getState().phase).toBe('offline')
    await syncNow('manual')
    expect(useSync.getState().phase).toBe('idle')
    expect(useSync.getState().pending).toBe(0)

    server.mode = 'broken'
    await syncNow('manual')
    expect(useSync.getState().phase).toBe('error')
    expect(useSync.getState().error).toMatch(/server/)

    server.mode = 'forbidden'
    await syncNow('manual')
    expect(useSync.getState().linked).toBe(false)
    expect(useSync.getState().error).toMatch(/no longer has access/)
    expect(await getSync(farmId)).toBeNull()
    expect(await db.events.count()).toBe(2)

    server.mode = 'ok'
    await linkFarm()
    expect(useSync.getState().linked).toBe(true)
    server.mode = 'unauthorized'
    await syncNow('manual')
    expect(useSync.getState().session).toBeNull()
    expect(useSync.getState().error).toMatch(/sign-in expired/i)

    await unlinkFarm()
    expect(await getSync(farmId)).toBeNull()
  })

  it('does nothing without a session or a linked farm', async () => {
    const farmId = await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
    await syncNow('open')
    expect(server.calls).toHaveLength(0)
    expect(useSync.getState().linked).toBe(false)
    useSync.getState().setSession(null)
    await syncNow('open')
    expect(server.calls).toHaveLength(0)
    expect(await outboxCount(farmId)).toBe(1)
  })
})
