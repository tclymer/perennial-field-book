/**
 * The local event log and photo store in IndexedDB. Every write goes through `attempt`,
 * which warns and degrades instead of throwing, so a browser with storage turned off
 * still runs the session in memory.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { AnyEvent } from './types'

export interface PhotoRow {
  id: string
  farmId: string
  mime: string
  blob: Blob
  createdAt: number
}

class FieldBookDb extends Dexie {
  events!: EntityTable<AnyEvent, 'id'>
  photos!: EntityTable<PhotoRow, 'id'>

  constructor() {
    super('perennial-field-book')
    this.version(1).stores({
      events: 'id, farmId, [farmId+ts]',
      photos: 'id, farmId',
    })
  }
}

export const db = new FieldBookDb()

async function attempt<T>(what: string, op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op()
  } catch (err) {
    console.warn(`Storage: ${what} failed`, err)
    return fallback
  }
}

/** Add new events. Fails as a whole if any id already exists. */
export function appendEvents(events: AnyEvent[]): Promise<boolean> {
  if (events.length === 0) return Promise.resolve(true)
  return attempt(
    'append events',
    async () => {
      await db.events.bulkAdd(events)
      return true
    },
    false,
  )
}

/** Add or overwrite events by id, for imports and sync. */
export function mergeEvents(events: AnyEvent[]): Promise<boolean> {
  if (events.length === 0) return Promise.resolve(true)
  return attempt(
    'merge events',
    async () => {
      await db.events.bulkPut(events)
      return true
    },
    false,
  )
}

/** Every event of a farm, unsorted. `null` when storage could not be read. */
export function loadEvents(farmId: string): Promise<AnyEvent[] | null> {
  return attempt('load events', () => db.events.where('farmId').equals(farmId).toArray(), null)
}

export function listFarmIds(): Promise<string[]> {
  return attempt(
    'list farms',
    async () => (await db.events.orderBy('farmId').uniqueKeys()) as string[],
    [],
  )
}

export function deleteFarmData(farmId: string): Promise<boolean> {
  return attempt(
    'delete farm',
    async () => {
      await db.transaction('rw', db.events, db.photos, async () => {
        await db.events.where('farmId').equals(farmId).delete()
        await db.photos.where('farmId').equals(farmId).delete()
      })
      return true
    },
    false,
  )
}

export function putPhoto(row: PhotoRow): Promise<boolean> {
  return attempt(
    'save photo',
    async () => {
      await db.photos.put(row)
      return true
    },
    false,
  )
}

export function getPhoto(id: string): Promise<PhotoRow | null> {
  return attempt('read photo', async () => (await db.photos.get(id)) ?? null, null)
}

export function listPhotos(farmId: string): Promise<PhotoRow[]> {
  return attempt('list photos', () => db.photos.where('farmId').equals(farmId).toArray(), [])
}
