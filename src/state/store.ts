/**
 * The open farm in memory, materialized from its event log. Every change is a list of new
 * events passed to `commit`, which stamps them, applies them, and appends them to storage.
 */
import { create } from 'zustand'
import type { FarmState, LngLat } from '@/model/types'
import { newId } from '@/model/ids'
import { parseEvent } from '@/model/schema'
import type { AnyEvent, Event, NewEvent } from '@/events/types'
import { applyEvents, emptyState, materialize } from '@/events/reduce'
import { appendEvents, deleteFarmData, loadEvents, mergeEvents } from '@/events/db'
import { deviceId } from './device'

const ACTIVE_KEY = 'fieldbook:activeFarmId'

export function readActiveFarmId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeActiveFarmId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Storage may be unavailable; the farm then lasts for this page only.
  }
}

let lastTs = 0
/** Strictly increasing on this device, so local order never depends on clock resolution. */
function nextTs(): number {
  lastTs = Math.max(Date.now(), lastTs + 1)
  return lastTs
}

let lastWrite: Promise<boolean> = Promise.resolve(true)
/** Resolves once every write issued so far has reached storage. For tests and exports. */
export function whenWritten(): Promise<boolean> {
  return lastWrite
}

interface FarmStore {
  state: FarmState
  farmId: string | null
  hydrated: boolean
  /** True once a write to the browser's storage has failed; the session then lives in memory. */
  storageUnavailable: boolean
  hydrate: () => Promise<void>
  /** Stamp, validate, apply, and persist. Returns the stamped events. */
  commit: (events: NewEvent[]) => Event[]
  createFarm: (name: string, center: LngLat, zoom: number) => Promise<string>
  /** Load another farm from storage. False when nothing readable is there. */
  openFarm: (farmId: string) => Promise<boolean>
  /** Merge an imported log into storage and open that farm. */
  importLog: (farmId: string, events: AnyEvent[]) => Promise<boolean>
  /** Delete the open farm from this browser. */
  deleteFarm: () => Promise<void>
  /**
   * Re-read the open farm from storage. Sync uses it after a pull, because events from
   * another device may be older than ones already applied and the reducer needs full order.
   */
  reload: () => Promise<void>
}

const track = (p: Promise<boolean>) => {
  lastWrite = p
  void p.then((ok) => {
    if (!ok) useFarmStore.setState({ storageUnavailable: true })
  })
}

let hydrating: Promise<void> | null = null

export const useFarmStore = create<FarmStore>()((set, get) => ({
  state: emptyState(),
  farmId: null,
  hydrated: false,
  storageUnavailable: false,

  hydrate: () => {
    if (hydrating) return hydrating
    hydrating = (async () => {
      const id = readActiveFarmId()
      if (id) {
        const ok = await get().openFarm(id)
        if (!ok) writeActiveFarmId(null)
      }
      set({ hydrated: true })
    })()
    return hydrating
  },

  openFarm: async (farmId) => {
    const events = await loadEvents(farmId)
    if (events === null) {
      set({ storageUnavailable: true })
      return false
    }
    if (events.length === 0) return false
    const state = materialize(events)
    lastTs = Math.max(lastTs, state.lastTs)
    writeActiveFarmId(farmId)
    set({ state, farmId })
    return true
  },

  commit: (events) => {
    const { farmId, state } = get()
    if (!farmId) throw new Error('No farm is open')
    const stamped = events.map(
      (e) =>
        parseEvent({
          id: newId('evt'),
          farmId,
          deviceId: deviceId(),
          ts: nextTs(),
          ...e,
        }) as Event,
    )
    set({ state: applyEvents(state, stamped) })
    track(appendEvents(stamped))
    return stamped
  },

  createFarm: async (name, center, zoom) => {
    const farmId = newId('farm')
    writeActiveFarmId(farmId)
    set({ farmId, state: emptyState() })
    get().commit([{ type: 'farm.create', payload: { id: farmId, name, center, zoom } }])
    await whenWritten()
    return farmId
  },

  importLog: async (farmId, events) => {
    const ok = await mergeEvents(events, { outbox: true })
    if (!ok) {
      set({ storageUnavailable: true })
      return false
    }
    return get().openFarm(farmId)
  },

  deleteFarm: async () => {
    const { farmId } = get()
    if (!farmId) return
    await deleteFarmData(farmId)
    writeActiveFarmId(null)
    set({ farmId: null, state: emptyState() })
  },

  reload: async () => {
    const { farmId } = get()
    if (!farmId) return
    await whenWritten()
    const events = await loadEvents(farmId)
    if (events === null || events.length === 0) return
    const state = materialize(events)
    lastTs = Math.max(lastTs, state.lastTs)
    // Only replace the state if nothing was committed meanwhile.
    if (get().farmId === farmId) set({ state })
  },
}))

/** For tests: forget the open farm without touching storage. */
export function resetStoreForTests(): void {
  hydrating = null
  useFarmStore.setState({
    state: emptyState(),
    farmId: null,
    hydrated: false,
    storageUnavailable: false,
  })
}
