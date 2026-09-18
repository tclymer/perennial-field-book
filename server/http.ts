/** Small HTTP helpers shared by every route: JSON in and out, errors as JSON, body limits. */
import type { z } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } })
}

/** Parse a JSON body against a schema. Refuses bodies over `maxBytes` before reading them. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 64 * 1024,
): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new HttpError(413, 'Request body is too large.')
  const text = await request.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Request body is too large.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Request body is not JSON.')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : ''
    throw new HttpError(400, `Invalid request${where}: ${issue?.message ?? 'malformed'}.`)
  }
  return result.data
}
