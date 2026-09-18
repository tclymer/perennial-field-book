/**
 * The sync loop (DESIGN.md §8.3): push the outbox, upload waiting photos, pull what the
 * server received since the cursor, and re-materialize if anything arrived. One run at a
 * time; failures back off; a dead session or lost membership is surfaced, never retried
 * blindly.
 */
import {
  clearOutbox,
  clearPhotoOutbox,
  deleteSync,
  getPhoto,
  getSync,
  mergeEvents,
  outboxCount,
  outboxEvents,
  photoOutboxIds,
  putSync,
  type SyncRow,
} from '@/events/db'
import type { AnyEvent } from '@/events/types'
import { parseEvent } from '@/model/schema'
import { useFarmStore, whenWritten } from '@/state/store'
import { api, ApiError } from './api'
import { refreshAccount } from './auth'
import { useSync } from './store'

const PUSH_PAGE = 2000
const PULL_PAGE = 1000
const WRITE_DELAY_MS = 3000
const TIMER_MS = 5 * 60 * 1000
const BACKOFF_MIN_MS = 10 * 1000
const BACKOFF_MAX_MS = 5 * 60 * 1000
/** While offline, try again this often: browsers do not always announce the connection returning. */
let offlineRetryMs = 15 * 1000

export type SyncReason =
  'open' | 'write' | 'online' | 'visible' | 'timer' | 'manual' | 'link' | 'retry'

let running: Promise<void> | null = null
let queued = false
let backoffMs = 0
let backoffUntil = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined

function scheduleRetry(ms: number): void {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void syncNow('retry'), ms)
}

/**
 * Run a sync, or queue one more run if one is in progress (a write during a sync must
 * still go up). Automatic reasons respect the back-off.
 */
export function syncNow(reason: SyncReason = 'manual'): Promise<void> {
  if (running) {
    queued = true
    return running.then(() => running ?? undefined)
  }
  // Only writes and the periodic timer wait out a back-off; anything that suggests the
  // situation changed (the app coming back, the network, a person asking) goes straight through.
  const forced = reason !== 'write' && reason !== 'timer'
  if (!forced && Date.now() < backoffUntil) return Promise.resolve()
  running = run().finally(() => {
    running = null
    if (queued) {
      queued = false
      void syncNow('write')
    }
  })
  return running
}

async function run(): Promise<void> {
  const { session, set } = useSync.getState()
  const { farmId } = useFarmStore.getState()
  if (!session || !farmId) return
  const link = await getSync(farmId)
  set({ linked: Boolean(link) })
  if (!link) return
  set({ phase: 'syncing' })
  try {
    await whenWritten()
    await push(farmId)
    await pushPhotos(farmId)
    const { received } = await pull(link)
    if (received > 0) await useFarmStore.getState().reload()
    backoffMs = 0
    backoffUntil = 0
    clearTimeout(retryTimer)
    set({
      phase: 'idle',
      lastSyncAt: Date.now(),
      error: null,
      pending: await outboxCount(farmId),
    })
  } catch (err) {
    await fail(farmId, err)
  }
}

async function push(farmId: string): Promise<void> {
  for (;;) {
    const batch = await outboxEvents(farmId, PUSH_PAGE)
    if (batch.length === 0) return
    await api('POST', `/api/farms/${farmId}/events`, { events: batch })
    await clearOutbox(batch.map((e) => e.id))
  }
}

async function pushPhotos(farmId: string): Promise<void> {
  for (const id of await photoOutboxIds(farmId)) {
    const row = await getPhoto(id)
    if (row) {
      await api('PUT', `/api/farms/${farmId}/photos/${id}`, undefined, {
        raw: { body: row.blob, contentType: row.mime },
      })
    }
    await clearPhotoOutbox(id)
  }
}

interface PullPage {
  events: unknown[]
  cursor: number
  more: boolean
}

/** Pull everything after the cursor into storage. Returns the new cursor and the count. */
export async function pull(link: SyncRow): Promise<{ cursor: number; received: number }> {
  let cursor = link.cursor
  let received = 0
  for (;;) {
    const page = await api<PullPage>(
      'GET',
      `/api/farms/${link.farmId}/events?after=${cursor}&limit=${PULL_PAGE}`,
    )
    const events: AnyEvent[] = []
    for (const raw of page.events) {
      try {
        events.push(parseEvent(raw) as AnyEvent)
      } catch (err) {
        console.warn('Sync: skipped a malformed event from the server', err)
      }
    }
    if (events.length > 0) {
      const ok = await mergeEvents(events, { outbox: false })
      if (!ok) throw new Error('This browser refused to store the pulled changes.')
      received += events.length
    }
    cursor = page.cursor
    await putSync({ ...link, cursor })
    if (!page.more) return { cursor, received }
  }
}

async function fail(farmId: string, err: unknown): Promise<void> {
  const { set, setSession } = useSync.getState()
  const pending = await outboxCount(farmId)
  if (err instanceof ApiError) {
    if (err.status === 401) {
      setSession(null)
      set({
        phase: 'error',
        pending,
        error: 'Your sign-in expired. Sign in again to keep syncing.',
      })
      return
    }
    if (err.status === 403 || err.status === 404) {
      await deleteSync(farmId)
      set({
        phase: 'error',
        linked: false,
        pending,
        error:
          err.status === 403
            ? 'This account no longer has access to this farm on the server. Your copy stays on this device.'
            : 'This farm is no longer on the server. Your copy stays on this device.',
      })
      return
    }
    if (err.offline) {
      backoffMs = BACKOFF_MIN_MS
      backoffUntil = Date.now() + backoffMs
      scheduleRetry(offlineRetryMs)
      set({ phase: 'offline', pending, error: null })
      return
    }
  }
  backoffMs = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, backoffMs * 2))
  backoffUntil = Date.now() + backoffMs
  scheduleRetry(backoffMs)
  set({
    phase: 'error',
    pending,
    error: err instanceof Error ? err.message : 'Sync failed.',
  })
}

/** Put the open farm on the server (or join this device to it) and sync. */
export async function linkFarm(): Promise<void> {
  const { farmId, state } = useFarmStore.getState()
  if (!farmId) throw new Error('No farm is open.')
  await api('POST', '/api/farms', { id: farmId, name: state.farm?.name ?? 'My Farm' })
  if (!(await getSync(farmId))) {
    await putSync({ farmId, cursor: 0, linkedAt: Date.now() })
  }
  useSync.getState().set({ linked: true, error: null })
  void refreshAccount()
  await syncNow('link')
}

/** Stop syncing the open farm from this device. Nothing is removed anywhere. */
export async function unlinkFarm(): Promise<void> {
  const { farmId } = useFarmStore.getState()
  if (farmId) await deleteSync(farmId)
  clearTimeout(retryTimer)
  useSync
    .getState()
    .set({ linked: false, phase: 'idle', pending: 0, lastSyncAt: null, error: null })
}

/**
 * Open a farm from the account's list: pull everything it has, then make it the open farm.
 * False when the server holds nothing for it yet.
 */
export async function openRemoteFarm(farmId: string): Promise<boolean> {
  const link = (await getSync(farmId)) ?? { farmId, cursor: 0, linkedAt: Date.now() }
  await putSync(link)
  await pull(link)
  const ok = await useFarmStore.getState().openFarm(farmId)
  if (ok) void syncNow('open')
  return ok
}

/** Refresh the linked flag and pending count for the open farm without syncing. */
export async function refreshSyncStatus(): Promise<void> {
  const { farmId } = useFarmStore.getState()
  const { set } = useSync.getState()
  if (!farmId) {
    set({ linked: false, pending: 0 })
    return
  }
  const link = await getSync(farmId)
  set({ linked: Boolean(link), pending: link ? await outboxCount(farmId) : 0 })
}

let installed = false

/** Wire the automatic triggers once for the page. Returns a cleanup for tests. */
export function installSyncTriggers(): () => void {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = useFarmStore.subscribe((s, prev) => {
    if (s.farmId !== prev.farmId) {
      void refreshSyncStatus().then(() => syncNow('open'))
    } else if (s.state.applied !== prev.state.applied && s.farmId) {
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow('write'), WRITE_DELAY_MS)
      void refreshSyncStatus()
    }
  })
  const online = () => void syncNow('online')
  const visible = () => {
    if (document.visibilityState === 'visible') void syncNow('visible')
  }
  window.addEventListener('online', online)
  document.addEventListener('visibilitychange', visible)
  const interval = setInterval(() => void syncNow('timer'), TIMER_MS)
  return () => {
    installed = false
    clearTimeout(timer)
    clearInterval(interval)
    unsubscribe()
    window.removeEventListener('online', online)
    document.removeEventListener('visibilitychange', visible)
  }
}

/** For tests: forget back-off and in-flight state. */
export function resetEngineForTests(retryMs = 15 * 1000): void {
  offlineRetryMs = retryMs
  running = null
  queued = false
  clearTimeout(retryTimer)
  backoffMs = 0
  backoffUntil = 0
}
