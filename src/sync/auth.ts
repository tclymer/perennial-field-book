/**
 * Sign-in from the app's side (DESIGN.md §8.3). The browser is sent to the server, which
 * runs Google's flow and returns to `/#/auth?c=<one-time code>`; that code becomes the
 * session token kept in the sync store.
 */
import { api, ApiError, setTokenProvider } from './api'
import { useSync, type RemoteFarm, type RemoteUser, type Session } from './store'

setTokenProvider(() => useSync.getState().session?.token ?? null)

/** Leave the app for Google. `returnTo` is the in-app route to come back to. */
export function signIn(returnTo = '/settings'): void {
  const url = `${location.origin}/api/auth/start?return=${encodeURIComponent(returnTo)}`
  location.assign(url)
}

/** Turn the one-time code from the return URL into a session. */
export async function finishSignIn(code: string): Promise<Session> {
  const session = await api<Session>('POST', '/api/auth/session', { code })
  useSync.getState().setSession(session)
  void refreshAccount()
  return session
}

export async function signOut(): Promise<void> {
  const { session, setSession } = useSync.getState()
  setSession(null)
  if (!session) return
  try {
    await api('POST', '/api/auth/logout')
  } catch {
    // The session is gone locally either way; the server one expires on its own.
  }
}

let refreshing: Promise<RemoteFarm[] | null> | null = null

/** Re-read the account and its farms. A dead session signs the app out. */
export function refreshAccount(): Promise<RemoteFarm[] | null> {
  if (refreshing) return refreshing
  refreshing = readAccount().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function readAccount(): Promise<RemoteFarm[] | null> {
  const { session, setSession, set } = useSync.getState()
  if (!session) return null
  try {
    const me = await api<{ user: RemoteUser; farms: RemoteFarm[] }>('GET', '/api/me')
    setSession({ token: session.token, user: me.user })
    set({ farms: me.farms })
    return me.farms
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setSession(null)
      set({ error: 'Your sign-in expired. Sign in again to keep syncing.' })
    }
    return null
  }
}

export function useSession(): Session | null {
  return useSync((s) => s.session)
}
