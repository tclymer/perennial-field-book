import type { EventType, PayloadOf } from '@/model/schema'

/** One immutable record in the log. Order is (ts, deviceId, id). */
export type Event<T extends EventType = EventType> = {
  [K in T]: {
    id: string
    farmId: string
    deviceId: string
    ts: number
    type: K
    payload: PayloadOf<K>
  }
}[T]

/** What an action produces: the store stamps the rest. */
export type NewEvent<T extends EventType = EventType> = {
  [K in T]: { type: K; payload: PayloadOf<K> }
}[T]

/** An event whose type this build does not know; kept in the log, ignored by the reducer. */
export interface UnknownEvent {
  id: string
  farmId: string
  deviceId: string
  ts: number
  type: string
  payload: unknown
}

export type AnyEvent = Event | UnknownEvent

export function ev<T extends EventType>(type: T, payload: PayloadOf<T>): NewEvent<T> {
  return { type, payload } as NewEvent<T>
}
