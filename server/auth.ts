/**
 * Sign-in with Google for identity only (DESIGN.md §8.3). The server holds the client secret
 * and runs the OAuth code flow; the app never sees Google tokens. A fresh session travels
 * back to the app as a one-time code in the return URL, so nothing depends on cookies or on
 * which browsing context (Safari, or the installed app's in-app sheet) ran Google's page.
 */
import { z } from 'zod'
import type { Deps, Env } from './env'
import { route, setUserResolver, type User } from './handle'
import { HttpError, json, noContent, readJson, redirect } from './http'

const SESSION_MS = 180 * 24 * 60 * 60 * 1000
/** A session is extended when it has been used and is older than this. */
const SESSION_TOUCH_MS = 24 * 60 * 60 * 1000
const STATE_MS = 10 * 60 * 1000
const HANDOFF_MS = 60 * 1000

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

/** Only in-app routes may be returned to. */
export function safeReturn(raw: string | null): string {
  if (!raw || raw.length > 200 || !raw.startsWith('/') || raw.startsWith('//')) return '/settings'
  if (/[\s<>"'\\]/.test(raw)) return '/settings'
  return raw
}

/** A URL into the app's hash router with query parameters. */
function appUrl(env: Env, path: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  return `${env.APP_ORIGIN}/#${path}${q ? `?${q}` : ''}`
}

function redirectUri(env: Env): string {
  return `${env.APP_ORIGIN}/api/auth/callback`
}

interface IdClaims {
  iss: string
  aud: string
  sub: string
  exp: number
  email?: string
  name?: string
  picture?: string
}

/**
 * Reads the claims of an ID token that arrived straight from Google's token endpoint over
 * TLS. Google documents that such a token needs no signature check; audience, issuer, and
 * expiry are still verified.
 */
export function decodeIdToken(token: string, clientId: string, nowMs: number): IdClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const text = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='))
    const claims = JSON.parse(decodeUtf8(text)) as Partial<IdClaims>
    if (typeof claims.sub !== 'string' || typeof claims.aud !== 'string') return null
    if (claims.aud !== clientId) return null
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') {
      return null
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < nowMs) return null
    return claims as IdClaims
  } catch {
    return null
  }
}

function decodeUtf8(binary: string): string {
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

interface SessionRow {
  session_id: string
  created_at: number
  expires_at: number
  last_seen_at: number
  id: string
  email: string
  name: string
  picture: string | null
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const m = /^Bearer\s+([A-Za-z0-9_-]{16,200})$/.exec(header)
  return m ? m[1]! : null
}

async function userForRequest(request: Request, env: Env, deps: Deps): Promise<User | null> {
  const token = bearerToken(request)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.created_at, s.expires_at, s.last_seen_at,
            u.id, u.email, u.name, u.picture
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(token)
    .first<SessionRow>()
  if (!row) return null
  const now = deps.now()
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run()
    return null
  }
  if (now - row.last_seen_at > SESSION_TOUCH_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(now, now + SESSION_MS, token)
      .run()
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture }
}

setUserResolver(userForRequest)

route(
  'GET',
  '/api/auth/start',
  async ({ env, deps, url }) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_ORIGIN) {
      throw new HttpError(503, 'Sign-in is not set up on this server yet.')
    }
    const returnTo = safeReturn(url.searchParams.get('return'))
    const state = deps.token()
    await env.DB.prepare('INSERT INTO auth_states (state, return_to, expires_at) VALUES (?, ?, ?)')
      .bind(state, returnTo, deps.now() + STATE_MS)
      .run()
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(env),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return redirect(`${GOOGLE_AUTH}?${params.toString()}`)
  },
  false,
)

route(
  'GET',
  '/api/auth/callback',
  async ({ env, deps, url }) => {
    const fail = (reason: string) => redirect(appUrl(env, '/auth', { error: reason }))
    const state = url.searchParams.get('state')
    const row = state
      ? await env.DB.prepare(
          'DELETE FROM auth_states WHERE state = ? RETURNING return_to, expires_at',
        )
          .bind(state)
          .first<{ return_to: string; expires_at: number }>()
      : null
    const now = deps.now()
    if (!row || row.expires_at < now) return fail('expired')
    const code = url.searchParams.get('code')
    if (!code || url.searchParams.get('error')) return fail('denied')

    const exchange = await deps.fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(env),
        grant_type: 'authorization_code',
      }).toString(),
    })
    if (!exchange.ok) {
      console.error('Google token exchange failed', exchange.status, await exchange.text())
      return fail('google')
    }
    const tokens = (await exchange.json()) as { id_token?: string }
    const claims = tokens.id_token
      ? decodeIdToken(tokens.id_token, env.GOOGLE_CLIENT_ID, now)
      : null
    if (!claims) return fail('google')

    const user = await env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, picture, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (google_sub) DO UPDATE SET
         email = excluded.email, name = excluded.name, picture = excluded.picture
       RETURNING id`,
    )
      .bind(
        `usr_${deps.token()}`,
        claims.sub,
        claims.email ?? '',
        claims.name ?? claims.email ?? 'Someone',
        claims.picture ?? null,
        now,
      )
      .first<{ id: string }>()
    if (!user) throw new HttpError(500, 'Could not save the account.')

    const sessionId = deps.token()
    const handoff = deps.token()
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(sessionId, user.id, now, now + SESSION_MS, now),
      env.DB.prepare('INSERT INTO handoffs (code, session_id, expires_at) VALUES (?, ?, ?)').bind(
        handoff,
        sessionId,
        now + HANDOFF_MS,
      ),
    ])
    return redirect(appUrl(env, '/auth', { c: handoff, return: row.return_to }))
  },
  false,
)

const sessionBody = z.object({ code: z.string().min(16).max(200) })

route(
  'POST',
  '/api/auth/session',
  async ({ request, env, deps }) => {
    const { code } = await readJson(request, sessionBody, 1024)
    const row = await env.DB.prepare(
      'DELETE FROM handoffs WHERE code = ? RETURNING session_id, expires_at',
    )
      .bind(code)
      .first<{ session_id: string; expires_at: number }>()
    if (!row || row.expires_at < deps.now()) {
      throw new HttpError(401, 'That sign-in link has expired. Try again.')
    }
    const user = await userForRequest(
      new Request(request.url, { headers: { authorization: `Bearer ${row.session_id}` } }),
      env,
      deps,
    )
    if (!user) throw new HttpError(401, 'That sign-in link has expired. Try again.')
    return json({ token: row.session_id, user })
  },
  false,
)

route('POST', '/api/auth/logout', async ({ request, env }) => {
  const token = bearerToken(request)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run()
  return noContent()
})

route('GET', '/api/me', async ({ env, user }) => {
  const farms = await env.DB.prepare(
    `SELECT f.id, f.name, m.role FROM members m JOIN farms f ON f.id = m.farm_id
      WHERE m.user_id = ? ORDER BY f.name`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; role: 'owner' | 'member' }>()
  return json({ user, farms: farms.results })
})
