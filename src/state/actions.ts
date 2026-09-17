/**
 * What the UI does to the farm. Each action turns an intent into events and commits them;
 * nothing here touches state directly. Refusals come back as `{ ok: false, reason }` so the
 * page can say why, never as exceptions.
 */
import type {
  FeatureGeometry,
  FillParams,
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
import { fillOutline } from '@/engine/fill'
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

// Trees

/** Today's date in the browser's own time zone, as YYYY-MM-DD. */
export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface PlantInput {
  varietyId?: string
  /** When it went in, or was grafted. */
  date?: string
  /** Whether the tree was planted whole or grafted onto something already there. */
  how?: 'planted' | 'grafted'
  rootstock?: string
  notes?: string
}

/** Put a tree at a position. Records a planted or grafted history event when dated. */
export function plantTree(posKey: string, input: PlantInput): string {
  const id = newId('tree')
  const how = input.how ?? 'planted'
  const events: NewEvent[] = [
    {
      type: 'tree.create',
      payload: {
        id,
        posKey,
        status: 'alive',
        ...(input.varietyId ? { varietyId: input.varietyId } : {}),
        ...(input.date && how === 'planted' ? { plantedDate: input.date } : {}),
        ...(input.date && how === 'grafted' ? { graftedDate: input.date } : {}),
        ...(input.rootstock ? { rootstock: input.rootstock } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    },
  ]
  if (input.date) {
    events.push({
      type: 'tree.event',
      payload: {
        id: newId('tev'),
        treeId: id,
        kind: how,
        date: input.date,
        ...(input.varietyId ? { varietyId: input.varietyId } : {}),
      },
    })
  }
  commit(events)
  return id
}

/** The tree now at a position, if any is still standing. */
export function currentTree(posKey: string) {
  return live
    .trees(state())
    .filter((t) => t.posKey === posKey)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}

/**
 * A new tree in an occupied position. The old one is marked removed on the same date
 * unless it is already dead or removed; both stay in the position's history.
 */
export function replaceTree(posKey: string, input: PlantInput): string {
  const old = currentTree(posKey)
  if (old && old.status !== 'dead' && old.status !== 'removed') {
    addTreeEvent(old.id, 'removed', { date: input.date ?? today() })
  }
  return plantTree(posKey, input)
}

export interface TreeEventInput {
  date?: string
  varietyId?: string
  status?: import('@/model/types').TreeStatus
  note?: string
  photoId?: string
}

export function addTreeEvent(
  treeId: string,
  kind: import('@/model/types').TreeEventKind,
  input: TreeEventInput = {},
): string {
  const id = newId('tev')
  commit([
    {
      type: 'tree.event',
      payload: {
        id,
        treeId,
        kind,
        date: input.date ?? today(),
        ...(input.varietyId ? { varietyId: input.varietyId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(input.photoId ? { photoId: input.photoId } : {}),
      },
    },
  ])
  return id
}

export function deleteTreeEvent(id: string): void {
  commit([{ type: 'tree.event.delete', payload: { id } }])
}

export function updateTree(id: string, patch: Omit<PayloadOf<'tree.patch'>, 'id'>): void {
  commit([{ type: 'tree.patch', payload: { id, ...patch } }])
}

export function deleteTree(id: string): void {
  commit([{ type: 'tree.delete', payload: { id } }])
}

// Bulk changes from the block grid. Each returns the events that undo it.

/** Give every selected position this variety: patch its tree, or plant one without a date. */
export function assignVariety(posKeys: string[], varietyId: string | null): NewEvent[] {
  const events: NewEvent[] = []
  const inverse: NewEvent[] = []
  for (const key of posKeys) {
    const tree = currentTree(key)
    if (tree) {
      if ((tree.varietyId ?? null) === varietyId) continue
      events.push({ type: 'tree.patch', payload: { id: tree.id, varietyId } })
      inverse.push({
        type: 'tree.patch',
        payload: { id: tree.id, varietyId: tree.varietyId ?? null },
      })
    } else if (varietyId) {
      const id = newId('tree')
      events.push({ type: 'tree.create', payload: { id, posKey: key, varietyId, status: 'alive' } })
      inverse.push({ type: 'tree.delete', payload: { id } })
    }
  }
  if (events.length) commit(events)
  return inverse
}

export function planGrafts(year: number, posKeys: string[], varietyId: string): NewEvent[] {
  const events: NewEvent[] = []
  const inverse: NewEvent[] = []
  for (const posKey of posKeys) {
    const prev = state().plans[`${year}:${posKey}`]
    if (prev && prev.varietyId === varietyId && !prev.doneEventId) continue
    events.push({ type: 'graft.plan', payload: { year, posKey, varietyId } })
    inverse.push(
      prev
        ? { type: 'graft.plan', payload: { year, posKey, varietyId: prev.varietyId } }
        : { type: 'graft.unplan', payload: { year, posKey } },
    )
  }
  if (events.length) commit(events)
  return inverse
}

export function unplanGrafts(year: number, posKeys: string[]): NewEvent[] {
  const events: NewEvent[] = []
  const inverse: NewEvent[] = []
  for (const posKey of posKeys) {
    const prev = state().plans[`${year}:${posKey}`]
    if (!prev) continue
    events.push({ type: 'graft.unplan', payload: { year, posKey } })
    inverse.push({ type: 'graft.plan', payload: { year, posKey, varietyId: prev.varietyId } })
  }
  if (events.length) commit(events)
  return inverse
}

/**
 * The planned graft happened: record it on the tree (or plant a grafted tree in an empty
 * position) and mark the plan done.
 */
export function completePlannedGraft(year: number, posKey: string, date = today()): Result {
  const plan = state().plans[`${year}:${posKey}`]
  if (!plan) return refuse('There is no graft planned here for that year.')
  const tree = currentTree(posKey)
  let eventId: string
  if (tree && tree.status !== 'dead' && tree.status !== 'removed') {
    eventId = addTreeEvent(tree.id, 'grafted', { date, varietyId: plan.varietyId })
  } else {
    const treeId = plantTree(posKey, { varietyId: plan.varietyId, date, how: 'grafted' })
    eventId = live.treeEvents(state(), treeId)[0]?.id ?? treeId
  }
  commit([{ type: 'graft.done', payload: { year, posKey, treeEventId: eventId } }])
  return ok
}

/** Commit a batch of events, used for undo. */
export function commitEvents(events: NewEvent[]): void {
  if (events.length) commit(events)
}

// Filling a block from its outline

/** Create every generated row in one commit, record the spacings, and number the rows. */
export function fillBlock(
  blockId: string,
  rows: { polyline: Polyline; count: number }[],
  params: FillParams,
): number {
  if (rows.length === 0) return 0
  const events: NewEvent[] = [
    {
      type: 'block.patch',
      payload: {
        id: blockId,
        rowSpacingFt: params.rowSpacingFt,
        inRowSpacingFt: params.treeSpacingFt,
        fill: params,
      },
    },
  ]
  let number = nextRowNumber(blockId)
  for (const r of rows) {
    events.push({
      type: 'row.create',
      payload: {
        id: newId('row'),
        blockId,
        number: number++,
        polyline: r.polyline,
        layout: { by: 'count', count: r.count },
      },
    })
  }
  commit(events)
  autoNumberRows(blockId)
  return rows.length
}

/** Remove every row of a block that holds no trees, so a fill can be redone. */
export function clearEmptyRows(blockId: string): number {
  const events: NewEvent[] = []
  for (const r of live.rows(state()).filter((r) => r.blockId === blockId)) {
    if (occupiedMaxIndex(state(), r.id) === 0)
      events.push({ type: 'row.delete', payload: { id: r.id } })
  }
  if (events.length) commit(events)
  return events.length
}

/**
 * The outline changed after a fill: drop rows that hold no trees and generate them again
 * from the remembered settings. Rows with trees are kept where they are.
 */
export function refillBlock(blockId: string): Result {
  const block = state().blocks[blockId]
  if (!block?.outline || !block.fill) return refuse('This block was not filled from an outline.')
  clearEmptyRows(blockId)
  const rows = fillOutline(block.outline, block.fill)
  fillBlock(blockId, rows, block.fill)
  return ok
}
