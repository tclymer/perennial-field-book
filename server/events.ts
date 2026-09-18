/**
 * The shared event log. Push is idempotent by event id; pull pages by the server's arrival
 * sequence, which is the sync cursor. Payloads are stored as JSON text and never
 * interpreted here, so a newer app's event types pass through an older server.
 */
import { z } from 'zod'
import { requireMember } from './farms'
import { route } from './handle'
import { HttpError, json, readJson } from './http'

export const MAX_EVENTS_PER_PUSH = 2000
export const MAX_PAYLOAD_BYTES = 32 * 1024
const MAX_PAGE = 1000

const eventEnvelope = z.object({
  id: z.string().min(1).max(80),
  farmId: z.string().min(1).max(80),
  deviceId: z.string().min(1).max(80),
  ts: z.number().int().min(0),
  type: z.string().min(1).max(60),
  payload: z.unknown(),
})

const pushBody = z.object({ events: z.array(eventEnvelope).max(MAX_EVENTS_PER_PUSH) })

route('POST', '/api/farms/:id/events', async ({ request, env, deps, params, user }) => {
  const farmId = params.id!
  await requireMember(env, farmId, user)
  const { events } = await readJson(request, pushBody, 12 * 1024 * 1024)
  const now = deps.now()
  const statements = events.map((e) => {
    if (e.farmId !== farmId) throw new HttpError(400, 'An event belongs to another farm.')
    const payload = JSON.stringify(e.payload ?? null)
    if (payload.length > MAX_PAYLOAD_BYTES) {
      throw new HttpError(413, `Event ${e.id} is larger than allowed.`)
    }
    return env.DB.prepare(
      `INSERT OR IGNORE INTO events (farm_id, id, device_id, ts, type, payload, user_id, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(farmId, e.id, e.deviceId, e.ts, e.type, payload, user.id, now)
  })
  let received = 0
  for (let i = 0; i < statements.length; i += 200) {
    const results = await env.DB.batch(statements.slice(i, i + 200))
    for (const r of results) received += r.meta.changes ?? 0
  }
  // The farm's name in account lists follows the latest rename in the log.
  const rename = events
    .filter((e) => e.type === 'farm.patch' || e.type === 'farm.create')
    .map((e) => (e.payload as { name?: unknown } | null)?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .at(-1)
  if (rename) {
    await env.DB.prepare('UPDATE farms SET name = ? WHERE id = ?')
      .bind(rename.trim().slice(0, 120), farmId)
      .run()
  }
  const top = await env.DB.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE farm_id = ?',
  )
    .bind(farmId)
    .first<{ seq: number }>()
  return json({ received, seq: top?.seq ?? 0 })
})

interface EventRow {
  seq: number
  id: string
  device_id: string
  ts: number
  type: string
  payload: string
}

route('GET', '/api/farms/:id/events', async ({ env, params, url, user }) => {
  const farmId = params.id!
  await requireMember(env, farmId, user)
  const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0)
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, Number(url.searchParams.get('limit') ?? MAX_PAGE) || MAX_PAGE),
  )
  const page = await env.DB.prepare(
    `SELECT seq, id, device_id, ts, type, payload FROM events
      WHERE farm_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
  )
    .bind(farmId, after, limit)
    .all<EventRow>()
  const rows = page.results
  const events = rows.map((r) => ({
    id: r.id,
    farmId,
    deviceId: r.device_id,
    ts: r.ts,
    type: r.type,
    payload: JSON.parse(r.payload) as unknown,
  }))
  const cursor = rows.length ? rows[rows.length - 1]!.seq : after
  return json({ events, cursor, more: rows.length === limit })
})
