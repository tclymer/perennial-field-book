/** Photo bytes in R2, one object per photo id, with a row in D1 for counts and ownership. */
import { requireMember } from './farms'
import { route } from './handle'
import { HttpError, noContent } from './http'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_ID = /^pho_[A-Za-z0-9_-]{4,70}$/

function key(farmId: string, photoId: string): string {
  return `farms/${farmId}/photos/${photoId}`
}

route('PUT', '/api/farms/:id/photos/:photoId', async ({ request, env, deps, params, user }) => {
  const farmId = params.id!
  const photoId = params.photoId!
  if (!PHOTO_ID.test(photoId)) throw new HttpError(400, 'Not a photo id.')
  await requireMember(env, farmId, user)
  const mime = request.headers.get('content-type') ?? ''
  if (!/^image\/[a-z0-9.+-]+$/i.test(mime)) throw new HttpError(415, 'Photos must be images.')
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_PHOTO_BYTES) throw new HttpError(413, 'That photo is larger than 5 MB.')
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) throw new HttpError(400, 'The photo is empty.')
  if (bytes.byteLength > MAX_PHOTO_BYTES)
    throw new HttpError(413, 'That photo is larger than 5 MB.')
  await env.PHOTOS.put(key(farmId, photoId), bytes, { httpMetadata: { contentType: mime } })
  await env.DB.prepare(
    `INSERT OR REPLACE INTO photos (farm_id, id, user_id, mime, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(farmId, photoId, user.id, mime, bytes.byteLength, deps.now())
    .run()
  return noContent()
})

route('GET', '/api/farms/:id/photos/:photoId', async ({ env, params, user }) => {
  const farmId = params.id!
  const photoId = params.photoId!
  if (!PHOTO_ID.test(photoId)) throw new HttpError(400, 'Not a photo id.')
  await requireMember(env, farmId, user)
  const object = await env.PHOTOS.get(key(farmId, photoId))
  if (!object) throw new HttpError(404, 'No such photo.')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'content-length': String(object.size),
      // Photos never change under an id; the browser may keep them.
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
})
