/**
 * Farms and who belongs to them. A farm is created on the server when a device turns on
 * sync for a local farm; the creator is its owner. Every other farm route goes through
 * `requireMember`.
 */
import { z } from 'zod'
import type { Env } from './env'
import { route, type User } from './handle'
import { HttpError, json, noContent, readJson } from './http'

export type Role = 'owner' | 'member'

const FARM_ID = /^farm_[A-Za-z0-9_-]{4,70}$/

/** The caller's role in the farm, or a 403 (404 when the farm does not exist). */
export async function requireMember(env: Env, farmId: string, user: User): Promise<Role> {
  const row = await env.DB.prepare(
    `SELECT m.role FROM farms f LEFT JOIN members m ON m.farm_id = f.id AND m.user_id = ?
      WHERE f.id = ?`,
  )
    .bind(user.id, farmId)
    .first<{ role: Role | null }>()
  if (!row) throw new HttpError(404, 'That farm is not on the server.')
  if (!row.role) throw new HttpError(403, 'You do not have access to this farm.')
  return row.role
}

export async function requireOwner(env: Env, farmId: string, user: User): Promise<void> {
  if ((await requireMember(env, farmId, user)) !== 'owner') {
    throw new HttpError(403, 'Only the owner of the farm can do that.')
  }
}

const createBody = z.object({
  id: z.string().regex(FARM_ID),
  name: z.string().trim().min(1).max(120),
})

route('POST', '/api/farms', async ({ request, env, deps, user }) => {
  const { id, name } = await readJson(request, createBody, 4096)
  const existing = await env.DB.prepare(
    `SELECT f.name, m.role FROM farms f LEFT JOIN members m ON m.farm_id = f.id AND m.user_id = ?
      WHERE f.id = ?`,
  )
    .bind(user.id, id)
    .first<{ name: string; role: Role | null }>()
  if (existing) {
    // Turning sync on again from another device of a member is fine; a stranger is not.
    if (!existing.role) throw new HttpError(409, 'That farm is already synced by another account.')
    return json({ id, name: existing.name, role: existing.role })
  }
  const now = deps.now()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO farms (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      name,
      user.id,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO members (farm_id, user_id, role, added_at) VALUES (?, ?, 'owner', ?)",
    ).bind(id, user.id, now),
  ])
  return json({ id, name, role: 'owner' }, 201)
})

route('GET', '/api/farms/:id', async ({ env, params, user }) => {
  const farmId = params.id!
  const role = await requireMember(env, farmId, user)
  const [farm, members, counts, invites] = await Promise.all([
    env.DB.prepare('SELECT id, name, owner_id, created_at FROM farms WHERE id = ?')
      .bind(farmId)
      .first<{ id: string; name: string; owner_id: string; created_at: number }>(),
    env.DB.prepare(
      `SELECT u.id, u.name, u.email, m.role, m.added_at AS addedAt
         FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.farm_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.added_at`,
    )
      .bind(farmId)
      .all<{ id: string; name: string; email: string; role: Role; addedAt: number }>(),
    // The highest sequence number stands in for the event count: counting them would read
    // every row of the farm on a call the settings page makes whenever it opens.
    env.DB.prepare(
      `SELECT (SELECT COALESCE(MAX(seq), 0) FROM events WHERE farm_id = ?) AS events,
              (SELECT COUNT(*) FROM photos WHERE farm_id = ?) AS photos,
              (SELECT COALESCE(SUM(bytes), 0) FROM photos WHERE farm_id = ?) AS photoBytes`,
    )
      .bind(farmId, farmId, farmId)
      .first<{ events: number; photos: number; photoBytes: number }>(),
    role === 'owner'
      ? env.DB.prepare(
          `SELECT token, created_at AS createdAt, expires_at AS expiresAt FROM invites
            WHERE farm_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
        )
          .bind(farmId)
          .all<{ token: string; createdAt: number; expiresAt: number }>()
      : Promise.resolve(null),
  ])
  if (!farm) throw new HttpError(404, 'That farm is not on the server.')
  return json({
    id: farm.id,
    name: farm.name,
    role,
    createdAt: farm.created_at,
    members: members.results,
    counts,
    invites: invites?.results ?? [],
  })
})

route('DELETE', '/api/farms/:id', async ({ env, params, user }) => {
  const farmId = params.id!
  await requireOwner(env, farmId, user)
  await deletePhotoObjects(env, farmId)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE farm_id = ?').bind(farmId),
    env.DB.prepare('DELETE FROM events WHERE farm_id = ?').bind(farmId),
    env.DB.prepare('DELETE FROM invites WHERE farm_id = ?').bind(farmId),
    env.DB.prepare('DELETE FROM members WHERE farm_id = ?').bind(farmId),
    env.DB.prepare('DELETE FROM farms WHERE id = ?').bind(farmId),
  ])
  return noContent()
})

async function deletePhotoObjects(env: Env, farmId: string): Promise<void> {
  const prefix = `farms/${farmId}/photos/`
  let cursor: string | undefined
  do {
    const page = await env.PHOTOS.list({ prefix, cursor, limit: 500 })
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}
