// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  fetchViewport,
  getSession,
  parseExpiry,
  sessionIsFresh,
  tileUrlTemplate,
} from '@/map/google'
import { CACHEABLE_TILE_RE } from '@/map/cacheable'

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

beforeEach(() => {
  localStorage.clear()
  clearSession()
})

describe('google sessions', () => {
  it('creates a session once and reuses it while fresh', async () => {
    const fetchImpl = vi.fn(async () => json({ session: 'tok', expiry: '1800000000' }))
    const a = await getSession('KEY', fetchImpl, 1_700_000_000_000)
    const b = await getSession('KEY', fetchImpl, 1_700_000_000_000)
    expect(a.session).toBe('tok')
    expect(b).toEqual(a)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://tile.googleapis.com/v1/createSession?key=KEY')
    expect(JSON.parse(String(init.body))).toEqual({
      mapType: 'satellite',
      language: 'en-US',
      region: 'US',
    })
  })

  it('renews a session that is about to expire and reports a refused key', async () => {
    const fetchImpl = vi.fn(async () => json({ session: 'new', expiry: 1_800_000_000 }))
    localStorage.setItem(
      'fieldbook:googleSession',
      JSON.stringify({ session: 'old', expiry: 1_700_000_000_000 + 3600_000 }),
    )
    const s = await getSession('KEY', fetchImpl, 1_700_000_000_000)
    expect(s.session).toBe('new')
    const denied = vi.fn(async () => json({}, 403))
    await expect(getSession('KEY', denied, 1_900_000_000_000)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('parses expiry in seconds or milliseconds', () => {
    expect(parseExpiry('1800000000')).toBe(1_800_000_000_000)
    expect(parseExpiry(1_800_000_000_000)).toBe(1_800_000_000_000)
    expect(sessionIsFresh({ session: 'x', expiry: 10 }, 5)).toBe(false)
    expect(sessionIsFresh(null)).toBe(false)
  })

  it('builds tile URLs the service worker will never cache', () => {
    const t = tileUrlTemplate('K', 'S')
    expect(t).toBe('https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=S&key=K')
    expect(
      CACHEABLE_TILE_RE.test(t.replace('{z}', '19').replace('{x}', '1').replace('{y}', '2')),
    ).toBe(false)
  })

  it('reads the attribution and max zoom for a view', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ copyright: 'Imagery ©2026 Maxar', maxZoomRects: [{ maxZoom: 20 }, { maxZoom: 19 }] }),
    )
    const v = await fetchViewport('K', 'S', [-77.1, 40.1, -77.0, 40.2], 17.4, fetchImpl)
    expect(v).toEqual({ copyright: 'Imagery ©2026 Maxar', maxZoom: 20 })
    const url = String((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url).toContain('/tile/v1/viewport?')
    expect(url).toContain('zoom=17')
    expect(url).toContain('north=40.2')
  })
})
