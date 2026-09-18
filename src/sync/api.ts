/**
 * The app's side of the API in server/. Same origin, so a relative path and a bearer token
 * are all a call needs. Errors carry the HTTP status; 0 means the request never reached
 * the server (offline, or the server is down).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
  get offline(): boolean {
    return this.status === 0
  }
}

let tokenProvider: () => string | null = () => null

/** Where the current session token comes from; set once by src/sync/auth.ts. */
export function setTokenProvider(fn: () => string | null): void {
  tokenProvider = fn
}

interface CallOptions {
  /** Raw body and content type instead of JSON, for photo uploads. */
  raw?: { body: BodyInit; contentType: string }
}

export async function api<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options: CallOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenProvider()
  if (token) headers.authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (options.raw) {
    headers['content-type'] = options.raw.contentType
    payload = options.raw.body
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: payload, cache: 'no-store' })
  } catch {
    throw new ApiError(0, 'No connection to the server.')
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status}).`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // Not JSON; keep the status text.
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await res.json()) as T
  return (await res.blob()) as T
}
