/**
 * Sharing a farm: the owner makes an invite link (seven days, multi-use, revocable), the
 * invited person signs in with their own Google account and joins. The owner can remove a
 * member; a member can leave. Access ends with the next request either way.
 */
import { z } from 'zod'
import { requireMember, requireOwner } from './farms'
import { route } from './handle'
import { HttpError, json, noContent, readJson } from './http'

const INVITE_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN = /^[A-Za-z0-9_-]{16,200}$/

route('POST', '/api/farms/:id/invites', async ({ env, deps, params, user }) => {
  const farmId = params.id!
  await requireOwner(env, farmId, user)
  const token = deps.token()
  const now = deps.now()
  await env.DB.prepare(
    'INSERT INTO invites (token, farm_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(token, farmId, user.id, now, now + INVITE_MS)
    .run()
  return json({ token, url: `${env.APP_ORIGIN}/#/join/${token}`, expiresAt: now + INVITE_MS }, 201)
})

route('DELETE', '/api/farms/:id/invites/:token', async ({ env, deps, params, user }) => {
  const farmId = params.id!
  await requireOwner(env, farmId, user)
  await env.DB.prepare(
    'UPDATE invites SET revoked_at = ? WHERE token = ? AND farm_id = ? AND revoked_at IS NULL',
  )
    .bind(deps.now(), params.token!, farmId)
    .run()
  return noContent()
})

interface InviteRow {
  farm_id: string
  name: string
  owner: string
  expires_at: number
  revoked_at: number | null
}

async function liveInvite(
  env: {
    DB: D1Database
  },
  token: string,
  now: number,
): Promise<InviteRow> {
  if (!TOKEN.test(token)) throw new HttpError(404, 'That invite link is not valid.')
  const row = await env.DB.prepare(
    `SELECT i.farm_id, f.name, u.name AS owner, i.expires_at, i.revoked_at
       FROM invites i JOIN farms f ON f.id = i.farm_id JOIN users u ON u.id = f.owner_id
      WHERE i.token = ?`,
  )
    .bind(token)
    .first<InviteRow>()
  if (!row) throw new HttpError(404, 'That invite link is not valid.')
  if (row.revoked_at !== null) throw new HttpError(410, 'That invite link was revoked.')
  if (row.expires_at < now)
    throw new HttpError(410, 'That invite link has expired. Ask for a new one.')
  return row
}

route('GET', '/api/invites/:token', async ({ env, deps, params, user }) => {
  const invite = await liveInvite(env, params.token!, deps.now())
  const member = await env.DB.prepare('SELECT role FROM members WHERE farm_id = ? AND user_id = ?')
    .bind(invite.farm_id, user.id)
    .first<{ role: string }>()
  return json({
    farmId: invite.farm_id,
    farmName: invite.name,
    ownerName: invite.owner,
    alreadyMember: Boolean(member),
  })
})

const joinBody = z.object({ token: z.string().regex(TOKEN) })

route('POST', '/api/join', async ({ request, env, deps, user }) => {
  const { token } = await readJson(request, joinBody, 1024)
  const now = deps.now()
  const invite = await liveInvite(env, token, now)
  await env.DB.prepare(
    "INSERT OR IGNORE INTO members (farm_id, user_id, role, added_at) VALUES (?, ?, 'member', ?)",
  )
    .bind(invite.farm_id, user.id, now)
    .run()
  const role = await requireMember(env, invite.farm_id, user)
  return json({ id: invite.farm_id, name: invite.name, role })
})

route('DELETE', '/api/farms/:id/members/:userId', async ({ env, params, user }) => {
  const farmId = params.id!
  const target = params.userId!
  const role = await requireMember(env, farmId, user)
  if (target === user.id) {
    if (role === 'owner') {
      throw new HttpError(400, 'The owner cannot leave. Delete the farm from the server instead.')
    }
  } else if (role !== 'owner') {
    throw new HttpError(403, 'Only the owner of the farm can remove people.')
  }
  const targetRole = await env.DB.prepare(
    'SELECT role FROM members WHERE farm_id = ? AND user_id = ?',
  )
    .bind(farmId, target)
    .first<{ role: string }>()
  if (!targetRole) throw new HttpError(404, 'That person is not on this farm.')
  if (targetRole.role === 'owner') throw new HttpError(400, 'The owner cannot be removed.')
  await env.DB.prepare('DELETE FROM members WHERE farm_id = ? AND user_id = ?')
    .bind(farmId, target)
    .run()
  return noContent()
})
