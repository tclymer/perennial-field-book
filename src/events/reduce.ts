/**
 * Turns the event log into FarmState. Events apply in (ts, deviceId, id) order; a patch
 * merges only the fields it carries, so later writers win per field; deletes are
 * tombstones; unknown event types are ignored.
 */
import type {
  Block,
  FarmState,
  Feature,
  LoosePosition,
  Person,
  Row,
  Task,
  Tree,
  TreeEvent,
  TreeStatus,
  Variety,
  WorkLog,
} from '@/model/types'
import { planKey } from '@/model/types'
import { PAYLOADS } from '@/model/schema'
import type { AnyEvent, Event } from './types'

export function emptyState(): FarmState {
  return {
    farm: null,
    blocks: {},
    rows: {},
    loosePositions: {},
    features: {},
    varieties: {},
    trees: {},
    treeEvents: {},
    people: {},
    tasks: {},
    logs: {},
    nudges: {},
    plans: {},
    applied: 0,
    lastTs: 0,
  }
}

export function compareEvents(a: AnyEvent, b: AnyEvent): number {
  if (a.ts !== b.ts) return a.ts - b.ts
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function sortEvents<E extends AnyEvent>(events: readonly E[]): E[] {
  return [...events].sort(compareEvents)
}

export function isKnownEvent(e: AnyEvent): e is Event {
  return Object.prototype.hasOwnProperty.call(PAYLOADS, e.type)
}

type Collections = Pick<
  FarmState,
  | 'blocks'
  | 'rows'
  | 'loosePositions'
  | 'features'
  | 'varieties'
  | 'trees'
  | 'people'
  | 'tasks'
  | 'logs'
>
type Collection = keyof Collections
type Entity = Collections[Collection][string]

const COLLECTION: Record<string, Collection> = {
  block: 'blocks',
  row: 'rows',
  position: 'loosePositions',
  feature: 'features',
  variety: 'varieties',
  tree: 'trees',
  person: 'people',
  task: 'tasks',
  log: 'logs',
}

/** Merge a patch: present fields overwrite, `null` clears, `undefined` is skipped. */
function merge<T extends object>(target: T, patch: object): T {
  const out = { ...target } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || v === undefined) continue
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out as T
}

function upsert(
  draft: FarmState,
  coll: Collection,
  id: string,
  fields: object,
  ts: number,
  status?: TreeStatus,
): void {
  const existing = (draft[coll] as Record<string, Entity>)[id]
  const base = existing ?? {
    id,
    createdAt: ts,
    ...(status ? { status } : {}),
    ...(coll === 'varieties' ? { aliases: [] } : {}),
    ...(coll === 'people' ? { active: true } : {}),
    ...(coll === 'tasks' ? { targets: [], order: 0 } : {}),
    ...(coll === 'logs' ? { targets: [], personIds: [] } : {}),
  }
  const next = { ...merge(base, fields), updatedAt: ts } as Entity
  ;(draft[coll] as Record<string, Entity>)[id] = next
}

function setDeleted(draft: FarmState, coll: Collection, id: string, deleted: boolean, ts: number) {
  const existing = (draft[coll] as Record<string, Entity>)[id]
  if (!existing) return
  const next = { ...existing, updatedAt: ts } as Entity & { deleted?: boolean }
  if (deleted) next.deleted = true
  else delete next.deleted
  ;(draft[coll] as Record<string, Entity>)[id] = next
}

/** The tree fields a history event implies. */
function treeEffects(e: Event<'tree.event'>['payload']): Partial<Tree> {
  switch (e.kind) {
    case 'planted':
      return {
        plantedDate: e.date,
        status: 'alive',
        ...(e.varietyId ? { varietyId: e.varietyId } : {}),
      }
    case 'grafted':
      return {
        graftedDate: e.date,
        status: 'alive',
        ...(e.varietyId ? { varietyId: e.varietyId } : {}),
      }
    case 'fruited':
      return { firstFruitYear: Number(e.date.slice(0, 4)) }
    case 'died':
      return { status: 'dead' }
    case 'removed':
      return { status: 'removed' }
    case 'status':
      return e.status ? { status: e.status } : {}
    default:
      return {}
  }
}

/** Apply one event to a draft in place. Returns false when the event was ignored. */
export function applyTo(draft: FarmState, event: AnyEvent): boolean {
  if (!isKnownEvent(event)) return false
  const ts = event.ts
  const [kind, verb, sub] = event.type.split('.')
  const coll = COLLECTION[kind]

  if (kind === 'farm') {
    if (verb === 'create') {
      const p = (event as Event<'farm.create'>).payload
      draft.farm = draft.farm
        ? { ...draft.farm, name: p.name, center: p.center, zoom: p.zoom }
        : { id: p.id, name: p.name, center: p.center, zoom: p.zoom, createdAt: ts }
    } else if (verb === 'patch' && draft.farm) {
      draft.farm = merge(draft.farm, (event as Event<'farm.patch'>).payload)
    }
  } else if (kind === 'graft') {
    const p = event.payload as { year: number; posKey: string }
    const key = planKey(p.year, p.posKey)
    if (verb === 'plan') {
      const { varietyId } = (event as Event<'graft.plan'>).payload
      draft.plans[key] = { year: p.year, posKey: p.posKey, varietyId }
    } else if (verb === 'unplan') {
      delete draft.plans[key]
    } else if (verb === 'done' && draft.plans[key]) {
      const { treeEventId } = (event as Event<'graft.done'>).payload
      draft.plans[key] = { ...draft.plans[key], doneEventId: treeEventId }
    }
  } else if (kind === 'position' && verb === 'nudge') {
    const { posKey, coord } = (event as Event<'position.nudge'>).payload
    if (coord) draft.nudges[posKey] = coord
    else delete draft.nudges[posKey]
  } else if (kind === 'tree' && verb === 'event') {
    if (sub === 'delete') {
      const { id } = (event as Event<'tree.event.delete'>).payload
      const existing = draft.treeEvents[id]
      if (existing) draft.treeEvents[id] = { ...existing, deleted: true }
    } else {
      const p = (event as Event<'tree.event'>).payload
      const record: TreeEvent = { ...p, createdAt: ts }
      draft.treeEvents[p.id] = record
      if (draft.trees[p.treeId]) upsert(draft, 'trees', p.treeId, treeEffects(p), ts)
    }
  } else if (coll) {
    const p = event.payload as { id: string }
    if (verb === 'create') {
      const { id, ...fields } = p
      upsert(draft, coll, id, fields, ts, kind === 'tree' ? 'alive' : undefined)
    } else if (verb === 'patch') {
      if (!draft[coll][p.id]) return false
      const { id, ...fields } = p
      upsert(draft, coll, id, fields, ts)
    } else if (verb === 'delete') {
      setDeleted(draft, coll, p.id, true, ts)
    } else if (verb === 'restore') {
      setDeleted(draft, coll, p.id, false, ts)
    }
  }

  draft.applied += 1
  if (ts > draft.lastTs) draft.lastTs = ts
  return true
}

function shallowClone(state: FarmState): FarmState {
  return {
    ...state,
    blocks: { ...state.blocks },
    rows: { ...state.rows },
    loosePositions: { ...state.loosePositions },
    features: { ...state.features },
    varieties: { ...state.varieties },
    trees: { ...state.trees },
    treeEvents: { ...state.treeEvents },
    people: { ...state.people },
    tasks: { ...state.tasks },
    logs: { ...state.logs },
    nudges: { ...state.nudges },
    plans: { ...state.plans },
  }
}

/** Apply events to a state without mutating it. For the store's incremental updates. */
export function applyEvents(state: FarmState, events: readonly AnyEvent[]): FarmState {
  const draft = shallowClone(state)
  for (const e of events) applyTo(draft, e)
  return draft
}

/** Build state from a whole log, in canonical order. */
export function materialize(events: readonly AnyEvent[]): FarmState {
  const draft = emptyState()
  for (const e of sortEvents(events)) applyTo(draft, e)
  return draft
}

/** Type helpers for readers. */
export const live = {
  blocks: (s: FarmState): Block[] => Object.values(s.blocks).filter((b) => !b.deleted),
  rows: (s: FarmState): Row[] =>
    Object.values(s.rows).filter((r) => !r.deleted && !s.blocks[r.blockId]?.deleted),
  loosePositions: (s: FarmState): LoosePosition[] =>
    Object.values(s.loosePositions).filter((p) => !p.deleted && !s.blocks[p.blockId]?.deleted),
  features: (s: FarmState): Feature[] => Object.values(s.features).filter((f) => !f.deleted),
  varieties: (s: FarmState): Variety[] => Object.values(s.varieties).filter((v) => !v.deleted),
  trees: (s: FarmState): Tree[] => Object.values(s.trees).filter((t) => !t.deleted),
  people: (s: FarmState): Person[] => Object.values(s.people).filter((p) => !p.deleted),
  tasks: (s: FarmState): Task[] =>
    Object.values(s.tasks).filter(
      (t) => !t.deleted && !(t.projectId && s.tasks[t.projectId]?.deleted),
    ),
  logs: (s: FarmState): WorkLog[] => Object.values(s.logs).filter((l) => !l.deleted),
  treeEvents: (s: FarmState, treeId: string): TreeEvent[] =>
    Object.values(s.treeEvents)
      .filter((e) => e.treeId === treeId && !e.deleted)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt)),
}
