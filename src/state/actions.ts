/**
 * What the UI does to the farm. Each action turns an intent into events and commits them;
 * nothing here touches state directly. Refusals come back as `{ ok: false, reason }` so the
 * page can say why, never as exceptions.
 */
import type {
  FeatureGeometry,
  FeatureKind,
  LngLat,
  Numbering,
  PlannerLink,
  Polyline,
  Ring,
  RowLayout,
} from '@/model/types'
import type { PayloadOf } from '@/model/schema'
import { newId, normalizeCode } from '@/model/ids'
import { live } from '@/events/reduce'
import type { NewEvent } from '@/events/types'
import { polylineLengthFt, positionCount } from '@/engine/geo'
import { autoNumberRows as orderRows, occupiedMaxIndex } from '@/engine/layout'
import { useFarmStore } from './store'

export type Result = { ok: true } | { ok: false; reason: string }

const ok: Result = { ok: true }
const refuse = (reason: string): Result => ({ ok: false, reason })

function state() {
  return useFarmStore.getState().state
}

function commit(events: NewEvent[]) {
  return useFarmStore.getState().commit(events)
}

// Blocks

export interface BlockInput {
  code: string
  name: string
  numbering?: Numbering
  species?: string
  rowSpacingFt?: number
  inRowSpacingFt?: number
  notes?: string
  planner?: PlannerLink
  color?: string
}

export function createBlock(input: BlockInput): string {
  const id = newId('blk')
  const { code, numbering, ...rest } = input
  commit([
    {
      type: 'block.create',
      payload: {
        id,
        code: normalizeCode(code),
        numbering: numbering ?? { rowsFrom: 'W', positionsFrom: '' },
        ...rest,
      },
    },
  ])
  return id
}

export function updateBlock(id: string, patch: Omit<PayloadOf<'block.patch'>, 'id'>): void {
  const p = { ...patch }
  if (typeof p.code === 'string') p.code = normalizeCode(p.code)
  commit([{ type: 'block.patch', payload: { id, ...p } }])
}

export function setBlockOutline(id: string, outline: Ring | null): void {
  commit([{ type: 'block.patch', payload: { id, outline } }])
}

export function deleteBlock(id: string): void {
  commit([{ type: 'block.delete', payload: { id } }])
}

/** Whether a block code is free to use (or already belongs to `exceptId`). */
export function codeAvailable(code: string, exceptId?: string): boolean {
  const c = normalizeCode(code)
  return !live.blocks(state()).some((b) => b.code === c && b.id !== exceptId)
}

// Rows

export function nextRowNumber(blockId: string): number {
  const nums = live
    .rows(state())
    .filter((r) => r.blockId === blockId)
    .map((r) => r.number)
  return nums.length ? Math.max(...nums) + 1 : 1
}

/** A sensible first layout for a freshly drawn row: the block's spacing, else about 15 ft. */
export function defaultLayout(blockId: string, polyline: Polyline): RowLayout {
  const block = state().blocks[blockId]
  if (block?.inRowSpacingFt) return { by: 'spacing', spacingFt: block.inRowSpacingFt }
  const guess = Math.max(2, Math.round(polylineLengthFt(polyline) / 15) + 1)
  return { by: 'count', count: guess }
}

export function createRow(blockId: string, polyline: Polyline, layout?: RowLayout): string {
  const id = newId('row')
  commit([
    {
      type: 'row.create',
      payload: {
        id,
        blockId,
        number: nextRowNumber(blockId),
        polyline,
        layout: layout ?? defaultLayout(blockId, polyline),
      },
    },
  ])
  return id
}

/** Refuses a layout that would drop a position holding a tree. */
export function setRowLayout(id: string, layout: RowLayout): Result {
  const row = state().rows[id]
  if (!row) return refuse('That row no longer exists.')
  const n = positionCount(row.polyline, layout)
  const max = occupiedMaxIndex(state(), id)
  if (n < max) {
    return refuse(
      `Position ${max} holds a tree. Keep at least ${max} positions, or remove that tree first.`,
    )
  }
  commit([{ type: 'row.patch', payload: { id, layout } }])
  return ok
}

export function updateRowPolyline(id: string, polyline: Polyline): Result {
  const row = state().rows[id]
  if (!row) return refuse('That row no longer exists.')
  if (row.layout.by === 'spacing') {
    const n = positionCount(polyline, row.layout)
    const max = occupiedMaxIndex(state(), id)
    if (n < max) {
      return refuse(
        `Shortening this row would drop position ${max}, which holds a tree. Change the spacing or remove that tree first.`,
      )
    }
  }
  commit([{ type: 'row.patch', payload: { id, polyline } }])
  return ok
}

/** Flip which end is position 1. Only while the row holds no trees, since labels would move. */
export function reverseRow(id: string): Result {
  const row = state().rows[id]
  if (!row) return refuse('That row no longer exists.')
  if (occupiedMaxIndex(state(), id) > 0) {
    return refuse('This row has trees, so reversing it would relabel them. Remove them first.')
  }
  const events: NewEvent[] = [
    { type: 'row.patch', payload: { id, polyline: [...row.polyline].reverse() } },
  ]
  for (const key of Object.keys(state().nudges)) {
    if (key.startsWith(`${id}:`))
      events.push({ type: 'position.nudge', payload: { posKey: key, coord: null } })
  }
  commit(events)
  return ok
}

/** Give a row a number; a row already holding it takes this row's old number. */
export function setRowNumber(id: string, number: number): void {
  const row = state().rows[id]
  if (!row || row.number === number) return
  const other = live.rows(state()).find((r) => r.blockId === row.blockId && r.number === number)
  const events: NewEvent[] = [{ type: 'row.patch', payload: { id, number } }]
  if (other) events.push({ type: 'row.patch', payload: { id: other.id, number: row.number } })
  commit(events)
}

export function setRowDefaultVariety(id: string, varietyId: string | null): void {
  commit([{ type: 'row.patch', payload: { id, defaultVarietyId: varietyId } }])
}

export function setRowNotes(id: string, notes: string | null): void {
  commit([{ type: 'row.patch', payload: { id, notes } }])
}

export function deleteRow(id: string): void {
  commit([{ type: 'row.delete', payload: { id } }])
}

/** Renumber a block's rows along its numbering side. Explicit, never automatic. */
export function autoNumberRows(blockId: string): number {
  const block = state().blocks[blockId]
  if (!block) return 0
  const rows = live.rows(state()).filter((r) => r.blockId === blockId)
  const order = orderRows(rows, block.numbering.rowsFrom)
  const events: NewEvent[] = []
  for (const { id, number } of order) {
    if (state().rows[id].number !== number)
      events.push({ type: 'row.patch', payload: { id, number } })
  }
  if (events.length) commit(events)
  return events.length
}

// Loose positions and nudges

export function createLoosePosition(blockId: string, coord: LngLat): string {
  const id = newId('pos')
  const nums = live
    .loosePositions(state())
    .filter((p) => p.blockId === blockId)
    .map((p) => p.number)
  const number = nums.length ? Math.max(...nums) + 1 : 1
  commit([{ type: 'position.create', payload: { id, blockId, number, coord } }])
  return id
}

export function moveLoosePosition(id: string, coord: LngLat): void {
  commit([{ type: 'position.patch', payload: { id, coord } }])
}

export function deleteLoosePosition(id: string): void {
  commit([{ type: 'position.delete', payload: { id } }])
}

export function nudgePosition(posKey: string, coord: LngLat | null): void {
  commit([{ type: 'position.nudge', payload: { posKey, coord } }])
}

// Features

export function createFeature(name: string, kind: FeatureKind, geometry: FeatureGeometry): string {
  const id = newId('ftr')
  commit([{ type: 'feature.create', payload: { id, name, kind, geometry } }])
  return id
}

export function updateFeature(id: string, patch: Omit<PayloadOf<'feature.patch'>, 'id'>): void {
  commit([{ type: 'feature.patch', payload: { id, ...patch } }])
}

export function deleteFeature(id: string): void {
  commit([{ type: 'feature.delete', payload: { id } }])
}

// Varieties

export interface VarietyInput {
  species: string
  name: string
  aliases?: string[]
  source?: string
  notes?: string
  color?: string
}

export function createVariety(input: VarietyInput): string {
  const id = newId('var')
  commit([{ type: 'variety.create', payload: { id, ...input } }])
  return id
}

export function updateVariety(id: string, patch: Omit<PayloadOf<'variety.patch'>, 'id'>): void {
  commit([{ type: 'variety.patch', payload: { id, ...patch } }])
}

export function deleteVariety(id: string): void {
  commit([{ type: 'variety.delete', payload: { id } }])
}

// Farm

export function setFarmHome(center: LngLat, zoom: number): void {
  commit([{ type: 'farm.patch', payload: { center, zoom } }])
}
