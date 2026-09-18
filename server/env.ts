/** Bindings and variables the API runs with. Bindings come from wrangler.jsonc, the rest from
 * .dev.vars locally and the Pages project's environment variables live. */
export interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  /** Where the app is served, e.g. https://fieldbook.theorganicorchard.org. Builds redirect URLs. */
  APP_ORIGIN: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

/** What the handler reaches outside itself; tests substitute all of it. */
export interface Deps {
  fetch: typeof fetch
  now: () => number
  /** Random token as URL-safe text, at least 128 bits. */
  token: () => string
}

export function defaultDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    token: () => {
      const bytes = new Uint8Array(24)
      crypto.getRandomValues(bytes)
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    },
  }
}
