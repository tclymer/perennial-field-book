import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signIn } from './auth.test'
import { bearer, jsonInit, startServer, type TestServer } from './harness'

const google = (sub: string, email: string) => ({
  iss: 'https://accounts.google.com',
  aud: 'client-id.apps.googleusercontent.com',
  sub,
  exp: 4102444800,
  email,
  name: email.split('@')[0],
})

let server: TestServer
let tim: string
let ann: string
beforeAll(async () => {
  server = await startServer()
  tim = (await signIn(server, google('1', 'tim@example.com'))).token
  ann = (await signIn(server, google('2', 'ann@example.com'))).token
})
afterAll(() => server.dispose())

const FARM = 'farm_threefold'

function event(id: string, ts: number, type = 'tree.patch', payload: unknown = { id: 'tree_1' }) {
  return { id, farmId: FARM, deviceId: 'dev_a', ts, type, payload }
}

describe('farms', () => {
  it('is created once by its owner and refused to strangers', async () => {
    const created = await server.fetch(
      '/api/farms',
      jsonInit('POST', { id: FARM, name: 'Threefold Farm' }, tim),
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: FARM, name: 'Threefold Farm', role: 'owner' })

    // Turning sync on from a second device of the owner is idempotent.
    const again = await server.fetch(
      '/api/farms',
      jsonInit('POST', { id: FARM, name: 'Renamed locally' }, tim),
    )
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ id: FARM, name: 'Threefold Farm', role: 'owner' })

    const stranger = await server.fetch(
      '/api/farms',
      jsonInit('POST', { id: FARM, name: 'Mine now' }, ann),
    )
    expect(stranger.status).toBe(409)
    expect((await server.fetch(`/api/farms/${FARM}`, bearer(ann))).status).toBe(403)
    expect((await server.fetch('/api/farms/farm_nope', bearer(ann))).status).toBe(404)
    expect(
      (await server.fetch('/api/farms', jsonInit('POST', { id: 'nope', name: 'x' }, tim))).status,
    ).toBe(400)

    const me = (await (await server.fetch('/api/me', bearer(tim))).json()) as { farms: unknown }
    expect(me.farms).toEqual([{ id: FARM, name: 'Threefold Farm', role: 'owner' }])

    const detail = (await (await server.fetch(`/api/farms/${FARM}`, bearer(tim))).json()) as {
      role: string
      members: { email: string; role: string }[]
      counts: { events: number; photos: number }
      invites: unknown[]
    }
    expect(detail.role).toBe('owner')
    expect(detail.members).toMatchObject([{ email: 'tim@example.com', role: 'owner' }])
    expect(detail.counts).toMatchObject({ events: 0, photos: 0 })
  })

  it('takes events once each and pages them back in arrival order', async () => {
    const push = await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit('POST', { events: [event('evt_1', 100), event('evt_2', 90)] }, tim),
    )
    expect(push.status).toBe(200)
    const first = (await push.json()) as { received: number; seq: number }
    expect(first.received).toBe(2)

    // A retry after a lost response changes nothing.
    const retry = await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit('POST', { events: [event('evt_2', 90), event('evt_3', 120)] }, tim),
    )
    // Ignored inserts may still consume a sequence number; only order matters.
    const second = (await retry.json()) as { received: number; seq: number }
    expect(second.received).toBe(1)
    expect(second.seq).toBeGreaterThan(first.seq)

    const page1 = (await (
      await server.fetch(`/api/farms/${FARM}/events?after=0&limit=2`, bearer(tim))
    ).json()) as { events: { id: string; ts: number }[]; cursor: number; more: boolean }
    expect(page1.events.map((e) => e.id)).toEqual(['evt_1', 'evt_2'])
    expect(page1).toMatchObject({ cursor: first.seq, more: true })
    const page2 = (await (
      await server.fetch(`/api/farms/${FARM}/events?after=${page1.cursor}&limit=2`, bearer(tim))
    ).json()) as { events: { id: string; payload: unknown }[]; cursor: number; more: boolean }
    expect(page2.events).toEqual([
      {
        id: 'evt_3',
        farmId: FARM,
        deviceId: 'dev_a',
        ts: 120,
        type: 'tree.patch',
        payload: { id: 'tree_1' },
      },
    ])
    expect(page2).toMatchObject({ cursor: second.seq, more: false })
    const empty = (await (
      await server.fetch(`/api/farms/${FARM}/events?after=${second.seq}`, bearer(tim))
    ).json()) as { events: unknown[]; cursor: number }
    expect(empty).toEqual({ events: [], cursor: second.seq, more: false })

    // Unknown event types pass through untouched.
    await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit('POST', { events: [event('evt_4', 130, 'future.thing', { x: [1, 2] })] }, tim),
    )
    // A rename in the log renames the farm in account lists.
    await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit('POST', { events: [event('evt_5', 140, 'farm.patch', { name: 'Renamed' })] }, tim),
    )
    const me = (await (await server.fetch('/api/me', bearer(tim))).json()) as {
      farms: { name: string }[]
    }
    expect(me.farms[0]?.name).toBe('Renamed')
    const future = (await (
      await server.fetch(`/api/farms/${FARM}/events?after=${second.seq}`, bearer(tim))
    ).json()) as { events: { type: string; payload: unknown }[] }
    expect(future.events[0]).toMatchObject({ type: 'future.thing', payload: { x: [1, 2] } })
  })

  it('refuses events for another farm, oversized events, and non-members', async () => {
    const wrongFarm = await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit('POST', { events: [{ ...event('evt_x', 1), farmId: 'farm_other' }] }, tim),
    )
    expect(wrongFarm.status).toBe(400)
    const big = await server.fetch(
      `/api/farms/${FARM}/events`,
      jsonInit(
        'POST',
        { events: [event('evt_big', 1, 'note', { text: 'x'.repeat(40_000) })] },
        tim,
      ),
    )
    expect(big.status).toBe(413)
    expect(
      (await server.fetch(`/api/farms/${FARM}/events`, jsonInit('POST', { events: [] }, ann)))
        .status,
    ).toBe(403)
    expect((await server.fetch(`/api/farms/${FARM}/events`, bearer(ann))).status).toBe(403)
    expect((await server.fetch(`/api/farms/${FARM}/events`)).status).toBe(401)
  })

  it('stores and serves photos within the size cap', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const put = await server.fetch(`/api/farms/${FARM}/photos/pho_abcd`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${tim}`, 'content-type': 'image/jpeg' },
      body: bytes,
    })
    expect(put.status).toBe(204)
    const get = await server.fetch(`/api/farms/${FARM}/photos/pho_abcd`, bearer(tim))
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes)
    expect((await server.fetch(`/api/farms/${FARM}/photos/pho_abcd`, bearer(ann))).status).toBe(403)
    expect((await server.fetch(`/api/farms/${FARM}/photos/pho_none`, bearer(tim))).status).toBe(404)

    const notImage = await server.fetch(`/api/farms/${FARM}/photos/pho_text`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${tim}`, 'content-type': 'text/plain' },
      body: 'hello',
    })
    expect(notImage.status).toBe(415)
    const huge = await server.fetch(`/api/farms/${FARM}/photos/pho_huge`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tim}`,
        'content-type': 'image/jpeg',
        'content-length': String(6 * 1024 * 1024),
      },
      body: bytes,
    })
    expect(huge.status).toBe(413)

    const detail = (await (await server.fetch(`/api/farms/${FARM}`, bearer(tim))).json()) as {
      counts: { events: number; photos: number; photoBytes: number }
    }
    expect(detail.counts).toMatchObject({ photos: 1, photoBytes: 7 })
    expect(detail.counts.events).toBeGreaterThan(0)
  })

  it('is deleted by its owner alone, with everything in it', async () => {
    expect(
      (await server.fetch(`/api/farms/${FARM}`, { method: 'DELETE', ...bearer(ann) })).status,
    ).toBe(403)
    const gone = await server.fetch(`/api/farms/${FARM}`, { method: 'DELETE', ...bearer(tim) })
    expect(gone.status).toBe(204)
    expect((await server.fetch(`/api/farms/${FARM}`, bearer(tim))).status).toBe(404)
    const me = (await (await server.fetch('/api/me', bearer(tim))).json()) as { farms: unknown[] }
    expect(me.farms).toEqual([])
    expect(await server.env.PHOTOS.get(`farms/${FARM}/photos/pho_abcd`)).toBeNull()
  })
})
