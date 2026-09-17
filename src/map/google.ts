/**
 * Google Map Tiles API: a session token, a tile URL template, and the attribution text for
 * the current view. Nothing here caches tiles; see DESIGN.md §8.1 and §8.6.
 */
export const GOOGLE_TILE_HOST = 'tile.googleapis.com'
const SESSION_KEY = 'fieldbook:googleSession'
/** Renew a session this long before Google would expire it. */
const RENEW_MARGIN_MS = 24 * 60 * 60 * 1000

export interface GoogleSession {
  session: string
  /** Milliseconds since the epoch. */
  expiry: number
}

export interface Viewport {
  copyright: string
  maxZoom: number
}

type Fetch = typeof fetch

function readCached(): GoogleSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as GoogleSession
    return typeof s.session === 'string' && typeof s.expiry === 'number' ? s : null
  } catch {
    return null
  }
}

function writeCached(s: GoogleSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage may be unavailable; the session then lasts for this page only.
  }
}

/** Google returns expiry as seconds since the epoch, sometimes as a string. */
export function parseExpiry(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n)) return Date.now() + 13 * 24 * 60 * 60 * 1000
  return n < 1e12 ? n * 1000 : n
}

export function sessionIsFresh(s: GoogleSession | null, now = Date.now()): s is GoogleSession {
  return Boolean(s && s.expiry - now > RENEW_MARGIN_MS)
}

/** A session token, from the cache when fresh, else a new one. Throws on a failed request. */
export async function getSession(
  key: string,
  fetchImpl: Fetch = fetch,
  now = Date.now(),
): Promise<GoogleSession> {
  const cached = readCached()
  if (sessionIsFresh(cached, now)) return cached
  const res = await fetchImpl(
    `https://${GOOGLE_TILE_HOST}/v1/createSession?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'satellite', language: 'en-US', region: 'US' }),
    },
  )
  if (!res.ok) {
    const err = new Error(`Google session request failed (${res.status})`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  const data = (await res.json()) as { session: string; expiry?: unknown }
  const session = { session: data.session, expiry: parseExpiry(data.expiry) }
  writeCached(session)
  return session
}

export function clearSession(): void {
  writeCached(null)
}

export function tileUrlTemplate(key: string, session: string): string {
  return `https://${GOOGLE_TILE_HOST}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`
}

/** The attribution Google requires for a view, and how far it can be zoomed there. */
export async function fetchViewport(
  key: string,
  session: string,
  bounds: [west: number, south: number, east: number, north: number],
  zoom: number,
  fetchImpl: Fetch = fetch,
): Promise<Viewport> {
  const q = new URLSearchParams({
    session,
    key,
    zoom: String(Math.round(zoom)),
    north: String(bounds[3]),
    south: String(bounds[1]),
    east: String(bounds[2]),
    west: String(bounds[0]),
  })
  const res = await fetchImpl(`https://${GOOGLE_TILE_HOST}/tile/v1/viewport?${q.toString()}`)
  if (!res.ok) throw new Error(`Google viewport request failed (${res.status})`)
  const data = (await res.json()) as {
    copyright?: string
    maxZoomRects?: { maxZoom: number }[]
  }
  const zooms = (data.maxZoomRects ?? []).map((r) => r.maxZoom).filter(Number.isFinite)
  return { copyright: data.copyright ?? 'Google', maxZoom: zooms.length ? Math.max(...zooms) : 22 }
}
