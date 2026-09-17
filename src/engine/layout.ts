/**
 * From blocks and rows to numbered positions with coordinates and labels. Nudges override
 * the generated coordinate of one position without changing the row.
 */
import type { Block, CompassSide, FarmState, LngLat, Row } from '@/model/types'
import { rowPosKey, treeLabel } from '@/model/ids'
import { live } from '@/events/reduce'
import {
  centroid,
  circularMeanDeg,
  headingDeg,
  polygonAreaSqFt,
  polylineLengthFt,
  positionsAlong,
} from './geo'

export interface PositionInfo {
  posKey: string
  blockId: string
  /** Null for a loose position. */
  rowId: string | null
  rowNumber: number | null
  index: number
  coord: LngLat
  label: string
  nudged: boolean
}

export function positionsForRow(
  block: Block,
  row: Row,
  nudges: Record<string, LngLat>,
): PositionInfo[] {
  return positionsAlong(row.polyline, row.layout).map((coord, i) => {
    const index = i + 1
    const posKey = rowPosKey(row.id, index)
    const nudge = nudges[posKey]
    return {
      posKey,
      blockId: block.id,
      rowId: row.id,
      rowNumber: row.number,
      index,
      coord: nudge ?? coord,
      label: treeLabel(block.code, row.number, index),
      nudged: Boolean(nudge),
    }
  })
}

/** Every position in the farm, rows first in row order, then loose positions. */
export function allPositions(state: FarmState): PositionInfo[] {
  const out: PositionInfo[] = []
  const rows = live.rows(state).sort((a, b) => a.number - b.number)
  for (const row of rows) {
    const block = state.blocks[row.blockId]
    if (!block) continue
    out.push(...positionsForRow(block, row, state.nudges))
  }
  for (const p of live.loosePositions(state)) {
    const block = state.blocks[p.blockId]
    if (!block) continue
    out.push({
      posKey: p.id,
      blockId: block.id,
      rowId: null,
      rowNumber: null,
      index: p.number,
      coord: p.coord,
      label: treeLabel(block.code, null, p.number),
      nudged: false,
    })
  }
  return out
}

export function rowLengthFt(row: Row): number {
  return polylineLengthFt(row.polyline)
}

/**
 * A block's area in square feet: the planner's figure when linked, else the drawn outline,
 * else each row's length times the row spacing. Zero when nothing is known.
 */
export function blockAreaSqFt(block: Block, rows: Row[]): number {
  const p = block.planner
  if (p?.rowLengthFt && p.rowWidthFt && p.rows) return p.rowLengthFt * p.rowWidthFt * p.rows
  if (block.outline && block.outline.length >= 3) return polygonAreaSqFt(block.outline)
  if (block.rowSpacingFt)
    return rows.reduce((sum, r) => sum + rowLengthFt(r) * block.rowSpacingFt!, 0)
  return 0
}

const SIDE_WORD: Record<CompassSide, string> = {
  N: 'north',
  S: 'south',
  E: 'east',
  W: 'west',
}

/** "Rows are numbered from the west; position 1 is at the road end." */
export function describeNumbering(block: Block): string {
  const from = block.numbering.positionsFrom.trim()
  const where = from ? (/^(the|at)\b/i.test(from) ? from : `the ${from}`) : 'the start of the row'
  return `Rows are numbered from the ${SIDE_WORD[block.numbering.rowsFrom]}; position 1 is at ${where}.`
}

/** Row ids in numbering order along the block's axis, with the numbers they should get. */
export function autoNumberRows(
  rows: Row[],
  rowsFrom: CompassSide,
): { id: string; number: number }[] {
  const keyed = rows.map((r) => {
    const c = centroid(r.polyline)
    const key = rowsFrom === 'W' ? c[0] : rowsFrom === 'E' ? -c[0] : rowsFrom === 'S' ? c[1] : -c[1]
    return { id: r.id, key }
  })
  keyed.sort((a, b) => a.key - b.key)
  return keyed.map((k, i) => ({ id: k.id, number: i + 1 }))
}

export function reversedPolyline(row: Row): LngLat[] {
  return [...row.polyline].reverse()
}

/** The map bearing that shows these rows running bottom to top: their mean heading. */
export function rowUpBearing(rows: Row[]): number {
  const headings = rows.filter((r) => r.polyline.length >= 2).map((r) => headingDeg(r.polyline))
  // Rows drawn in opposite directions still run the same way; fold them onto one half-circle.
  const folded = headings.map((h) => (h >= 180 ? h - 180 : h))
  return circularMeanDeg(folded.map((h) => h * 2)) / 2
}

/** The highest position index in a row that holds a live tree, or 0. */
export function occupiedMaxIndex(state: FarmState, rowId: string): number {
  let max = 0
  const prefix = `${rowId}:`
  for (const t of live.trees(state)) {
    if (!t.posKey.startsWith(prefix)) continue
    const idx = Number(t.posKey.slice(prefix.length))
    if (idx > max) max = idx
  }
  return max
}
