import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer, type TestServer } from './harness'

let server: TestServer
beforeAll(async () => {
  server = await startServer()
})
afterAll(() => server.dispose())

describe('router', () => {
  it('answers health and refuses what it does not know', async () => {
    const ok = await server.fetch('/api/health')
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    const missing = await server.fetch('/api/nothing')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Not found.' })
    const wrongMethod = await server.fetch('/api/health', { method: 'POST' })
    expect(wrongMethod.status).toBe(405)
  })

  it('requires a session on protected routes', async () => {
    const res = await server.fetch('/api/me')
    expect(res.status).toBe(401)
  })
})
