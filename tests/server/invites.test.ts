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

const FARM = 'farm_shared'
let server: TestServer
let tim: string
let ann: string
let annId: string
let bob: string
beforeAll(async () => {
  server = await startServer()
  tim = (await signIn(server, google('1', 'tim@example.com'))).token
  const a = await signIn(server, google('2', 'ann@example.com'))
  ann = a.token
  annId = a.user.id
  bob = (await signIn(server, google('3', 'bob@example.com'))).token
  await server.fetch('/api/farms', jsonInit('POST', { id: FARM, name: 'Shared Farm' }, tim))
})
afterAll(() => server.dispose())

const push = (token: string, id: string) =>
  server.fetch(
    `/api/farms/${FARM}/events`,
    jsonInit(
      'POST',
      { events: [{ id, farmId: FARM, deviceId: 'd', ts: 1, type: 'x', payload: null }] },
      token,
    ),
  )

describe('sharing', () => {
  let invite: { token: string; url: string; expiresAt: number }

  it('lets the owner alone make invite links', async () => {
    expect(
      (await server.fetch(`/api/farms/${FARM}/invites`, { method: 'POST', ...bearer(ann) })).status,
    ).toBe(403)
    const res = await server.fetch(`/api/farms/${FARM}/invites`, { method: 'POST', ...bearer(tim) })
    expect(res.status).toBe(201)
    invite = (await res.json()) as typeof invite
    expect(invite.url).toBe(`https://fieldbook.test/#/join/${invite.token}`)
    expect(invite.expiresAt).toBe(server.deps.clock.now + 7 * 24 * 60 * 60 * 1000)
  })

  it('previews and joins with the link, once', async () => {
    const preview = await server.fetch(`/api/invites/${invite.token}`, bearer(ann))
    expect(preview.status).toBe(200)
    expect(await preview.json()).toEqual({
      farmId: FARM,
      farmName: 'Shared Farm',
      ownerName: 'tim',
      alreadyMember: false,
    })
    expect((await server.fetch('/api/invites/nope', bearer(ann))).status).toBe(404)
    expect((await server.fetch(`/api/invites/${invite.token}`)).status).toBe(401)

    const join = await server.fetch('/api/join', jsonInit('POST', { token: invite.token }, ann))
    expect(join.status).toBe(200)
    expect(await join.json()).toEqual({ id: FARM, name: 'Shared Farm', role: 'member' })
    const again = await server.fetch('/api/join', jsonInit('POST', { token: invite.token }, ann))
    expect(await again.json()).toEqual({ id: FARM, name: 'Shared Farm', role: 'member' })
    expect(
      (await (await server.fetch(`/api/invites/${invite.token}`, bearer(ann))).json()) as object,
    ).toMatchObject({ alreadyMember: true })

    expect((await push(ann, 'evt_ann')).status).toBe(200)
    const detail = (await (await server.fetch(`/api/farms/${FARM}`, bearer(ann))).json()) as {
      role: string
      members: { email: string }[]
      invites: unknown[]
    }
    expect(detail.role).toBe('member')
    expect(detail.members.map((m) => m.email)).toEqual(['tim@example.com', 'ann@example.com'])
    // Members do not see the invite links.
    expect(detail.invites).toEqual([])
    const owner = (await (await server.fetch(`/api/farms/${FARM}`, bearer(tim))).json()) as {
      invites: { token: string }[]
    }
    expect(owner.invites.map((i) => i.token)).toEqual([invite.token])
  })

  it('refuses a revoked link and an expired one', async () => {
    const revoke = await server.fetch(`/api/farms/${FARM}/invites/${invite.token}`, {
      method: 'DELETE',
      ...bearer(tim),
    })
    expect(revoke.status).toBe(204)
    expect(
      (await server.fetch('/api/join', jsonInit('POST', { token: invite.token }, bob))).status,
    ).toBe(410)
    const fresh = (await (
      await server.fetch(`/api/farms/${FARM}/invites`, { method: 'POST', ...bearer(tim) })
    ).json()) as { token: string }
    server.deps.clock.now += 8 * 24 * 60 * 60 * 1000
    const late = await server.fetch('/api/join', jsonInit('POST', { token: fresh.token }, bob))
    expect(late.status).toBe(410)
    expect(((await late.json()) as { error: string }).error).toMatch(/expired/)
  })

  it('removes a member, who is refused from the next request on', async () => {
    expect(
      (
        await server.fetch(`/api/farms/${FARM}/members/${annId}`, {
          method: 'DELETE',
          ...bearer(bob),
        })
      ).status,
    ).toBe(403)
    const me = (await (await server.fetch('/api/me', bearer(tim))).json()) as {
      user: { id: string }
    }
    // The owner cannot leave or be removed.
    expect(
      (
        await server.fetch(`/api/farms/${FARM}/members/${me.user.id}`, {
          method: 'DELETE',
          ...bearer(tim),
        })
      ).status,
    ).toBe(400)
    const removed = await server.fetch(`/api/farms/${FARM}/members/${annId}`, {
      method: 'DELETE',
      ...bearer(tim),
    })
    expect(removed.status).toBe(204)
    expect((await push(ann, 'evt_ann2')).status).toBe(403)
    expect((await server.fetch(`/api/farms/${FARM}/events?after=0`, bearer(ann))).status).toBe(403)
    const annMe = (await (await server.fetch('/api/me', bearer(ann))).json()) as {
      farms: unknown[]
    }
    expect(annMe.farms).toEqual([])
    // What they pushed while a member stays.
    const events = (await (
      await server.fetch(`/api/farms/${FARM}/events?after=0`, bearer(tim))
    ).json()) as { events: { id: string }[] }
    expect(events.events.map((e) => e.id)).toEqual(['evt_ann'])
  })

  it('lets a member leave', async () => {
    const link = (await (
      await server.fetch(`/api/farms/${FARM}/invites`, { method: 'POST', ...bearer(tim) })
    ).json()) as { token: string }
    await server.fetch('/api/join', jsonInit('POST', { token: link.token }, bob))
    const bobMe = (await (await server.fetch('/api/me', bearer(bob))).json()) as {
      user: { id: string }
      farms: unknown[]
    }
    expect(bobMe.farms).toHaveLength(1)
    const left = await server.fetch(`/api/farms/${FARM}/members/${bobMe.user.id}`, {
      method: 'DELETE',
      ...bearer(bob),
    })
    expect(left.status).toBe(204)
    expect((await server.fetch(`/api/farms/${FARM}`, bearer(bob))).status).toBe(403)
  })
})
