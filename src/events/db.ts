/**
 * The local event log and photo store in IndexedDB. Every write goes through `attempt`,
 * which warns and degrades instead of throwing, so a browser with storage turned off
 * still runs the session in memory.
 *
 * Version 2 adds sync bookkeeping: an outbox of local events and photos not yet on the
 * server, and the pull cursor per farm (DESIGN.md §8.3).
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

export interface OutboxRow {
  id: string
  farmId: string
}

export interface SyncRow {
  farmId: string
  /** The last server sequence number pulled. */
  cursor: number
  linkedAt: number
}

class FieldBookDb extends Dexie {
  events!: EntityTable<AnyEvent, 'id'>
  photos!: EntityTable<PhotoRow, 'id'>
  outbox!: EntityTable<OutboxRow, 'id'>
  photoOutbox!: EntityTable<OutboxRow, 'id'>
  sync!: EntityTable<SyncRow, 'farmId'>

  constructor() {
    super('perennial-field-book')
    this.version(1).stores({
      events: 'id, farmId, [farmId+ts]',
      photos: 'id, farmId',
    })
    this.version(2)
      .stores({
        events: 'id, farmId, [farmId+ts]',
        photos: 'id, farmId',
        outbox: 'id, farmId',
        photoOutbox: 'id, farmId',
        sync: 'farmId',
      })
      .upgrade(async (tx) => {
        // Everything recorded before sync existed is local and still to be pushed.
        const events = await tx.table<AnyEvent>('events').toArray()
        await tx
          .table<OutboxRow>('outbox')
          .bulkAdd(events.map((e) => ({ id: e.id, farmId: e.farmId })))
        const photos = await tx.table<PhotoRow>('photos').toArray()
        await tx
          .table<OutboxRow>('photoOutbox')
          .bulkAdd(photos.map((p) => ({ id: p.id, farmId: p.farmId })))
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

/** Add new local events. Fails as a whole if any id already exists. */
export function appendEvents(events: AnyEvent[]): Promise<boolean> {
  if (events.length === 0) return Promise.resolve(true)
  return attempt(
    'append events',
    async () => {
      await db.transaction('rw', db.events, db.outbox, async () => {
        await db.events.bulkAdd(events)
        await db.outbox.bulkAdd(events.map((e) => ({ id: e.id, farmId: e.farmId })))
      })
      return true
    },
    false,
  )
}

/**
 * Add or overwrite events by id. Events from a file import are local (`outbox: true`);
 * events pulled from the server are not.
 */
export function mergeEvents(events: AnyEvent[], options: { outbox: boolean }): Promise<boolean> {
  if (events.length === 0) return Promise.resolve(true)
  return attempt(
    'merge events',
    async () => {
      await db.transaction('rw', db.events, db.outbox, async () => {
        await db.events.bulkPut(events)
        if (options.outbox) {
          await db.outbox.bulkPut(events.map((e) => ({ id: e.id, farmId: e.farmId })))
        }
      })
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
      await db.transaction(
        'rw',
        [db.events, db.photos, db.outbox, db.photoOutbox, db.sync],
        async () => {
          await db.events.where('farmId').equals(farmId).delete()
          await db.photos.where('farmId').equals(farmId).delete()
          await db.outbox.where('farmId').equals(farmId).delete()
          await db.photoOutbox.where('farmId').equals(farmId).delete()
          await db.sync.delete(farmId)
        },
      )
      return true
    },
    false,
  )
}

/** Store a photo. Local photos (`outbox: true`) wait to be uploaded; pulled ones do not. */
export function putPhoto(row: PhotoRow, options: { outbox: boolean }): Promise<boolean> {
  return attempt(
    'save photo',
    async () => {
      await db.transaction('rw', db.photos, db.photoOutbox, async () => {
        await db.photos.put(row)
        if (options.outbox) await db.photoOutbox.put({ id: row.id, farmId: row.farmId })
      })
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

// --- sync bookkeeping

/** Local events of a farm still to be pushed, oldest first, at most `limit`. */
export function outboxEvents(farmId: string, limit: number): Promise<AnyEvent[]> {
  return attempt(
    'read outbox',
    async () => {
      const rows = await db.outbox.where('farmId').equals(farmId).limit(limit).toArray()
      const events = await db.events.bulkGet(rows.map((r) => r.id))
      const found = events.filter((e): e is AnyEvent => e !== undefined)
      found.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
      return found
    },
    [],
  )
}

export function clearOutbox(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return Promise.resolve(true)
  return attempt(
    'clear outbox',
    async () => {
      await db.outbox.bulkDelete(ids)
      return true
    },
    false,
  )
}

export function outboxCount(farmId: string): Promise<number> {
  return attempt('count outbox', () => db.outbox.where('farmId').equals(farmId).count(), 0)
}

export function photoOutboxIds(farmId: string): Promise<string[]> {
  return attempt(
    'read photo outbox',
    async () => (await db.photoOutbox.where('farmId').equals(farmId).toArray()).map((r) => r.id),
    [],
  )
}

export function clearPhotoOutbox(id: string): Promise<boolean> {
  return attempt(
    'clear photo outbox',
    async () => {
      await db.photoOutbox.delete(id)
      return true
    },
    false,
  )
}

export function getSync(farmId: string): Promise<SyncRow | null> {
  return attempt('read sync', async () => (await db.sync.get(farmId)) ?? null, null)
}

export function putSync(row: SyncRow): Promise<boolean> {
  return attempt(
    'write sync',
    async () => {
      await db.sync.put(row)
      return true
    },
    false,
  )
}

export function deleteSync(farmId: string): Promise<boolean> {
  return attempt(
    'delete sync',
    async () => {
      await db.sync.delete(farmId)
      return true
    },
    false,
  )
}
