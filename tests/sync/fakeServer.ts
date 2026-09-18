/**
 * An in-memory stand-in for server/ behind `fetch`, for engine tests. It mimics the
 * routes the engine uses: farms, events push and pull, photos, and /api/me.
 */
import type { AnyEvent } from '@/events/types'

export interface FakeServer {
  farms: Map<string, { name: string; members: Set<string> }>
  events: { seq: number; farmId: string; event: AnyEvent }[]
  photos: Map<string, { mime: string; bytes: Uint8Array<ArrayBuffer> }>
  /** Requests seen, oldest first. */
  calls: { method: string; path: string; contentType: string | null }[]
  /** Behaviour switches. */
  mode: 'ok' | 'offline' | 'unauthorized' | 'forbidden' | 'broken'
  validToken: string
  /** Put an event on the server as if another device pushed it. */
  receive: (farmId: string, event: AnyEvent) => void
  install: () => void
  uninstall: () => void
}

/** jsdom blobs lack arrayBuffer(); FileReader works for both jsdom and Node blobs. */
function blobBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.readAsArrayBuffer(blob)
  })
}

export function fakeServer(): FakeServer {
  let seq = 0
  const original = globalThis.fetch
  const server: FakeServer = {
    farms: new Map(),
    events: [],
    photos: new Map(),
    calls: [],
    mode: 'ok',
    validToken: 'tok_test',
    receive(farmId, event) {
      server.events.push({ seq: ++seq, farmId, event })
    },
    install() {
      globalThis.fetch = handler as typeof fetch
    },
    uninstall() {
      globalThis.fetch = original
    },
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  async function handler(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input), 'http://app.test')
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    server.calls.push({
      method,
      path: url.pathname + url.search,
      contentType: headers.get('content-type'),
    })
    if (server.mode === 'offline') throw new TypeError('Failed to fetch')
    if (server.mode === 'broken') return json({ error: 'Something went wrong on the server.' }, 500)
    const auth = headers.get('authorization')
    if (server.mode === 'unauthorized' || auth !== `Bearer ${server.validToken}`) {
      return json({ error: 'Sign in to continue.' }, 401)
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.pathname === '/api/me') {
      return json({
        user: { id: 'usr_1', email: 'tim@example.com', name: 'Tim', picture: null },
        farms: [...server.farms].map(([id, f]) => ({ id, name: f.name, role: 'owner' })),
      })
    }
    if (url.pathname === '/api/farms' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { id: string; name: string }
      const existing = server.farms.get(body.id)
      if (!existing) server.farms.set(body.id, { name: body.name, members: new Set(['usr_1']) })
      return json(
        { id: body.id, name: existing?.name ?? body.name, role: 'owner' },
        existing ? 200 : 201,
      )
    }
    if (parts[0] === 'api' && parts[1] === 'farms' && parts[2]) {
      const farmId = parts[2]
      if (server.mode === 'forbidden')
        return json({ error: 'You do not have access to this farm.' }, 403)
      if (!server.farms.has(farmId)) return json({ error: 'That farm is not on the server.' }, 404)
      if (parts[3] === 'events' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { events: AnyEvent[] }
        let received = 0
        for (const e of body.events) {
          if (server.events.some((row) => row.farmId === farmId && row.event.id === e.id)) continue
          server.events.push({ seq: ++seq, farmId, event: e })
          received += 1
        }
        return json({ received, seq })
      }
      if (parts[3] === 'events' && method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 1000)
        const rows = server.events
          .filter((r) => r.farmId === farmId && r.seq > after)
          .slice(0, limit)
        return json({
          events: rows.map((r) => r.event),
          cursor: rows.length ? rows[rows.length - 1]!.seq : after,
          more: rows.length === limit,
        })
      }
      if (parts[3] === 'photos' && parts[4] && method === 'PUT') {
        // fake-indexeddb hands back stored blobs as plain objects; a real browser keeps them.
        const body = init?.body
        server.photos.set(parts[4], {
          mime: headers.get('content-type') ?? '',
          bytes: body instanceof Blob ? await blobBytes(body) : new Uint8Array(),
        })
        return new Response(null, { status: 204 })
      }
      if (parts[3] === 'photos' && parts[4] && method === 'GET') {
        const photo = server.photos.get(parts[4])
        if (!photo) return json({ error: 'No such photo.' }, 404)
        return new Response(photo.bytes, { headers: { 'content-type': photo.mime } })
      }
    }
    return json({ error: 'Not found.' }, 404)
  }
  return server
}
