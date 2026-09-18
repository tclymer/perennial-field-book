/**
 * The API entry point: routes a request under /api to its handler, turns thrown HttpErrors
 * into JSON, and never lets anything else out as a stack trace. Routes marked `auth` run
 * only with a valid session; handlers get the user.
 */
import { defaultDeps, type Deps, type Env } from './env'
import { HttpError, json } from './http'

export interface User {
  id: string
  email: string
  name: string
  picture: string | null
}

export interface Ctx {
  request: Request
  env: Env
  deps: Deps
  url: URL
  params: Record<string, string>
  /** Present on routes that require a session. */
  user: User
}

type Handler = (c: Ctx) => Promise<Response> | Response

interface Route {
  method: string
  segments: string[]
  auth: boolean
  handler: Handler
}

const routes: Route[] = []

/** Register a route. Patterns are absolute paths; `:name` segments become params. */
export function route(method: string, pattern: string, handler: Handler, auth = true): void {
  routes.push({ method, segments: pattern.split('/').filter(Boolean), auth, handler })
}

function match(segments: string[], path: string[]): Record<string, string> | null {
  if (segments.length !== path.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    const p = path[i]!
    if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(p)
    else if (s !== p) return null
  }
  return params
}

/** Set by server/auth.ts so the router can resolve sessions without a circular import. */
let resolveUser: (request: Request, env: Env, deps: Deps) => Promise<User | null> = async () => null
export function setUserResolver(fn: typeof resolveUser): void {
  resolveUser = fn
}

export async function handle(
  request: Request,
  env: Env,
  deps: Deps = defaultDeps(),
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.split('/').filter(Boolean)
  try {
    let methodMismatch = false
    for (const r of routes) {
      const params = match(r.segments, path)
      if (!params) continue
      if (r.method !== request.method) {
        methodMismatch = true
        continue
      }
      const ctx: Ctx = { request, env, deps, url, params, user: null as unknown as User }
      if (r.auth) {
        const user = await resolveUser(request, env, deps)
        if (!user) throw new HttpError(401, 'Sign in to continue.')
        ctx.user = user
      }
      return await r.handler(ctx)
    }
    throw new HttpError(
      methodMismatch ? 405 : 404,
      methodMismatch ? 'Method not allowed.' : 'Not found.',
    )
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error('API failure', request.method, url.pathname, err)
    return json({ error: 'Something went wrong on the server.' }, 500)
  }
}

route('GET', '/api/health', () => json({ ok: true }), false)
