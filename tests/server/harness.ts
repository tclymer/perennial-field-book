/**
 * Runs the API against a real D1 and R2 provided by Miniflare, in this Node process. The
 * handler itself is plain fetch-handler code, so nothing needs to run inside workerd.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare } from 'miniflare'
import type { Deps, Env } from '../../server/env'
import { handle } from '../../server/api'

const MIGRATION = readFileSync(join(import.meta.dirname, '../../migrations/0001_init.sql'), 'utf8')

export interface TestServer {
  env: Env
  deps: Deps & { clock: { now: number }; googleFetch: typeof fetch | null }
  /** Send a request to the API. A relative path is resolved against APP_ORIGIN. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  dispose: () => Promise<void>
}

export async function startServer(): Promise<TestServer> {
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name: 'api',
          type: 'worker',
          compatibilityDate: '2025-09-01',
          manifest: {
            mainModule: 'index.mjs',
            modules: {
              'index.mjs': {
                type: 'esm',
                contents:
                  'export default { fetch() { return new Response(null, { status: 404 }) } }',
              },
            },
          },
          env: {
            DB: { type: 'd1', id: 'fieldbook-test' },
            PHOTOS: { type: 'r2', name: 'fieldbook-photos-test' },
          },
        },
      },
    ],
  })
  const DB = (await mf.getD1Database('DB')) as unknown as D1Database
  const PHOTOS = (await mf.getR2Bucket('PHOTOS')) as unknown as R2Bucket
  // D1's exec() wants one statement per line, so run the migration statement by statement.
  const statements = MIGRATION.split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
  await DB.batch(statements.map((stmt) => DB.prepare(stmt)))

  const env: Env = {
    DB,
    PHOTOS,
    APP_ORIGIN: 'https://fieldbook.test',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'not-a-real-secret',
  }
  let counter = 0
  const deps: TestServer['deps'] = {
    clock: { now: Date.UTC(2026, 8, 17, 12, 0, 0) },
    googleFetch: null,
    now: () => deps.clock.now,
    token: () => `tok${(++counter).toString(36).padStart(20, '0')}`,
    fetch: (input, init) => {
      if (!deps.googleFetch) throw new Error(`Unexpected outbound fetch: ${String(input)}`)
      return deps.googleFetch(input, init)
    },
  }
  return {
    env,
    deps,
    fetch: (path, init) => handle(new Request(new URL(path, env.APP_ORIGIN), init), env, deps),
    dispose: () => mf.dispose(),
  }
}

/** JSON request helper. */
export function jsonInit(method: string, body: unknown, token?: string): RequestInit {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }
}

export function bearer(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } }
}
