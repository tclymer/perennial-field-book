/**
 * Who is signed in and how sync is going. The session lives in localStorage so the installed
 * app keeps it; everything else is for the current page.
 */
import { create } from 'zustand'

export interface RemoteUser {
  id: string
  email: string
  name: string
  picture: string | null
}

export interface RemoteFarm {
  id: string
  name: string
  role: 'owner' | 'member'
}

export interface Session {
  token: string
  user: RemoteUser
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncStore {
  session: Session | null
  /** Farms this account can open on the server, from the last /api/me. */
  farms: RemoteFarm[]
  phase: SyncPhase
  lastSyncAt: number | null
  /** Local changes not yet on the server, for the open farm. */
  pending: number
  /** The last problem, shown in Settings until the next successful sync. */
  error: string | null
  setSession: (session: Session | null) => void
  set: (patch: Partial<Omit<SyncStore, 'set' | 'setSession'>>) => void
}

const SESSION_KEY = 'fieldbook:session'

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed.token !== 'string' || !parsed.user || typeof parsed.user.id !== 'string') {
      return null
    }
    return parsed as Session
  } catch {
    return null
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage may be unavailable; the session then lasts for this page only.
  }
}

export const useSync = create<SyncStore>()((set) => ({
  session: readSession(),
  farms: [],
  phase: 'idle',
  lastSyncAt: null,
  pending: 0,
  error: null,
  setSession: (session) => {
    writeSession(session)
    set({ session, ...(session ? {} : { farms: [] }) })
  },
  set: (patch) => set(patch),
}))

/** For tests: forget everything in memory and storage. */
export function resetSyncForTests(): void {
  writeSession(null)
  useSync.setState({
    session: null,
    farms: [],
    phase: 'idle',
    lastSyncAt: null,
    pending: 0,
    error: null,
  })
}
