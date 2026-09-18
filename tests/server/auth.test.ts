import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeIdToken, safeReturn } from '../../server/auth'
import { bearer, jsonInit, startServer, type TestServer } from './harness'

const CLIENT_ID = 'client-id.apps.googleusercontent.com'

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** An unsigned ID token shaped like Google's; the server trusts the token endpoint, not a signature. */
export function fakeIdToken(claims: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(claims))}.sig`
}

let server: TestServer
beforeAll(async () => {
  server = await startServer()
})
afterAll(() => server.dispose())

function googleAnswers(claims: Record<string, unknown> | null, status = 200) {
  server.deps.googleFetch = async (input, init) => {
    expect(String(input)).toBe('https://oauth2.googleapis.com/token')
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_secret')).toBe('not-a-real-secret')
    expect(body.get('redirect_uri')).toBe('https://fieldbook.test/api/auth/callback')
    if (status !== 200) return new Response('nope', { status })
    return Response.json(claims ? { id_token: fakeIdToken(claims) } : {})
  }
}

const tim = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '10001',
  exp: Math.floor(Date.UTC(2026, 8, 17, 13) / 1000),
  email: 'tim@example.com',
  name: 'Tim',
  picture: 'https://example.com/tim.png',
}

/** Runs start → callback and returns the app URL the browser is sent to. */
export async function signIn(
  s: TestServer,
  claims: Record<string, unknown>,
  returnTo = '/settings',
): Promise<{ token: string; user: { id: string; email: string } }> {
  const start = await s.fetch(`/api/auth/start?return=${encodeURIComponent(returnTo)}`)
  const google = new URL(start.headers.get('location')!)
  s.deps.googleFetch = async () => Response.json({ id_token: fakeIdToken(claims) })
  const back = await s.fetch(
    `/api/auth/callback?code=abc&state=${google.searchParams.get('state')}`,
  )
  const app = back.headers.get('location')!
  const code = new URLSearchParams(app.split('?')[1]).get('c')!
  const session = await s.fetch('/api/auth/session', jsonInit('POST', { code }))
  return (await session.json()) as { token: string; user: { id: string; email: string } }
}

describe('sign-in', () => {
  it('sends the browser to Google with a stored state', async () => {
    const res = await server.fetch('/api/auth/start?return=/blocks')
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('location')!)
    expect(to.origin).toBe('https://accounts.google.com')
    expect(to.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(to.searchParams.get('redirect_uri')).toBe('https://fieldbook.test/api/auth/callback')
    expect(to.searchParams.get('scope')).toBe('openid email profile')
    expect(to.searchParams.get('state')).toMatch(/^tok/)
  })

  it('creates the account and hands the session to the app once', async () => {
    const start = await server.fetch('/api/auth/start?return=/blocks')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    googleAnswers(tim)
    const back = await server.fetch(`/api/auth/callback?code=abc&state=${state}`)
    expect(back.status).toBe(302)
    const app = back.headers.get('location')!
    expect(app.startsWith('https://fieldbook.test/#/auth?')).toBe(true)
    const q = new URLSearchParams(app.split('?')[1])
    expect(q.get('return')).toBe('/blocks')
    const code = q.get('c')!

    const session = await server.fetch('/api/auth/session', jsonInit('POST', { code }))
    expect(session.status).toBe(200)
    const { token, user } = (await session.json()) as {
      token: string
      user: { id: string; email: string; name: string; picture: string }
    }
    expect(user).toMatchObject({ email: 'tim@example.com', name: 'Tim' })
    expect(user.id).toMatch(/^usr_/)

    // The handoff code is single use.
    const again = await server.fetch('/api/auth/session', jsonInit('POST', { code }))
    expect(again.status).toBe(401)

    const me = await server.fetch('/api/me', bearer(token))
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ user, farms: [] })

    // A state cannot be replayed.
    const replay = await server.fetch(`/api/auth/callback?code=abc&state=${state}`)
    expect(replay.headers.get('location')).toContain('error=expired')

    // Signing in again with the same Google account reuses the user and updates the name.
    const second = await signIn(server, { ...tim, name: 'Tim C.' })
    expect(second.user.id).toBe(user.id)
    expect(
      (await (await server.fetch('/api/me', bearer(second.token))).json()) as object,
    ).toMatchObject({ user: { name: 'Tim C.' } })

    const out = await server.fetch('/api/auth/logout', { method: 'POST', ...bearer(token) })
    expect(out.status).toBe(204)
    expect((await server.fetch('/api/me', bearer(token))).status).toBe(401)
    // The other session is untouched.
    expect((await server.fetch('/api/me', bearer(second.token))).status).toBe(200)
  })

  it('reports Google refusals and bad tokens without creating anything', async () => {
    const state = async () => {
      const start = await server.fetch('/api/auth/start')
      return new URL(start.headers.get('location')!).searchParams.get('state')!
    }
    expect((await server.fetch('/api/auth/callback?code=x')).headers.get('location')).toContain(
      'error=expired',
    )
    expect(
      (
        await server.fetch(`/api/auth/callback?error=access_denied&state=${await state()}`)
      ).headers.get('location'),
    ).toContain('error=denied')
    googleAnswers(null, 400)
    expect(
      (await server.fetch(`/api/auth/callback?code=x&state=${await state()}`)).headers.get(
        'location',
      ),
    ).toContain('error=google')
    googleAnswers({ ...tim, aud: 'someone-else' })
    expect(
      (await server.fetch(`/api/auth/callback?code=x&state=${await state()}`)).headers.get(
        'location',
      ),
    ).toContain('error=google')
    const s = await state()
    server.deps.clock.now += 11 * 60 * 1000
    expect(
      (await server.fetch(`/api/auth/callback?code=x&state=${s}`)).headers.get('location'),
    ).toContain('error=expired')
  })

  it('expires handoff codes and sessions', async () => {
    const start = await server.fetch('/api/auth/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    googleAnswers({ ...tim, sub: '10002', email: 'ann@example.com', name: 'Ann' })
    const back = await server.fetch(`/api/auth/callback?code=abc&state=${state}`)
    const code = new URLSearchParams(back.headers.get('location')!.split('?')[1]).get('c')!
    server.deps.clock.now += 61 * 1000
    expect((await server.fetch('/api/auth/session', jsonInit('POST', { code }))).status).toBe(401)

    const { token } = await signIn(server, { ...tim, sub: '10002', email: 'ann@example.com' })
    server.deps.clock.now += 100 * 24 * 60 * 60 * 1000
    // Used at day 100: still valid and extended.
    expect((await server.fetch('/api/me', bearer(token))).status).toBe(200)
    server.deps.clock.now += 100 * 24 * 60 * 60 * 1000
    expect((await server.fetch('/api/me', bearer(token))).status).toBe(200)
    server.deps.clock.now += 181 * 24 * 60 * 60 * 1000
    expect((await server.fetch('/api/me', bearer(token))).status).toBe(401)
  })
})

describe('helpers', () => {
  it('only returns to in-app routes', () => {
    expect(safeReturn('/blocks')).toBe('/blocks')
    expect(safeReturn('/join/abc')).toBe('/join/abc')
    expect(safeReturn(null)).toBe('/settings')
    expect(safeReturn('https://evil.example')).toBe('/settings')
    expect(safeReturn('//evil.example')).toBe('/settings')
    expect(safeReturn('/x"y')).toBe('/settings')
  })

  it('checks audience, issuer, and expiry of an ID token', () => {
    const now = Date.UTC(2026, 8, 17, 12)
    expect(decodeIdToken(fakeIdToken(tim), CLIENT_ID, now)?.sub).toBe('10001')
    expect(decodeIdToken(fakeIdToken({ ...tim, iss: 'https://x' }), CLIENT_ID, now)).toBeNull()
    expect(decodeIdToken(fakeIdToken(tim), 'other', now)).toBeNull()
    expect(decodeIdToken(fakeIdToken({ ...tim, exp: 1 }), CLIENT_ID, now)).toBeNull()
    expect(decodeIdToken('garbage', CLIENT_ID, now)).toBeNull()
  })
})
