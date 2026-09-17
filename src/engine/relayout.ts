/**
 * Re-laying out a block that already has rows and trees. Old rows keep their identity when
 * a new row lands close to them, so trees keep their labels and history; the plan reports
 * what would move or lose its position before anything is committed.
 */
import type { FarmState, Row } from '@/model/types'
import { live } from '@/events/reduce'
import { rowPosKey } from '@/model/ids'
import { distanceFt, positionsAlong, toLocal } from './geo'
import { positionsForRow } from './layout'
import type { FilledRow } from './fill'

export interface RowUpdate {
  rowId: string
  polyline: FilledRow['polyline']
  count: number
  /** Positions that hold a tree but are beyond the new count. */
  orphanIndexes: number[]
}

export interface RelayoutPlan {
  updates: RowUpdate[]
  creates: FilledRow[]
  /** Unmatched rows with no trees: removed. */
  deletes: string[]
  /** Unmatched rows that hold trees: left exactly as they are. */
  kept: string[]
  /** Trees whose drawn spot changes by less than half a tree spacing. */
  stays: number
  /** Trees that keep their label but will be drawn somewhere else. */
  moves: number
  /** Trees whose position no longer exists in their row. */
  orphans: number
}

/** Distance from a point to a segment, in feet. */
function pointToSegmentFt(p: [number, number], a: [number, number], b: [number, number]): number {
  const [ax, ay] = toLocal(a, a)
  const [bx, by] = toLocal(a, b)
  const [px, py] = toLocal(a, p)
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const qx = ax + t * dx
  const qy = ay + t * dy
  return Math.hypot(px - qx, py - qy)
}

function midpoint(line: FilledRow['polyline']): [number, number] {
  const a = line[0]
  const b = line[line.length - 1]
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

export function planRelayout(
  state: FarmState,
  blockId: string,
  newRows: FilledRow[],
  rowSpacingFt: number,
  treeSpacingFt: number,
): RelayoutPlan {
  const block = state.blocks[blockId]
  const oldRows = live.rows(state).filter((r) => r.blockId === blockId)
  const trees = live.trees(state)
  const plan: RelayoutPlan = {
    updates: [],
    creates: [],
    deletes: [],
    kept: [],
    stays: 0,
    moves: 0,
    orphans: 0,
  }
  if (!block) return plan

  // Match each old row to the nearest new row, greedily by distance, within 60% of a spacing.
  const pairs: { old: Row; idx: number; d: number }[] = []
  oldRows.forEach((old) => {
    newRows.forEach((n, idx) => {
      const d = pointToSegmentFt(
        midpoint(old.polyline),
        n.polyline[0],
        n.polyline[n.polyline.length - 1],
      )
      if (d <= rowSpacingFt * 0.6) pairs.push({ old, idx, d })
    })
  })
  pairs.sort((a, b) => a.d - b.d)
  const matchedOld = new Set<string>()
  const matchedNew = new Set<number>()
  const match = new Map<string, number>()
  for (const p of pairs) {
    if (matchedOld.has(p.old.id) || matchedNew.has(p.idx)) continue
    matchedOld.add(p.old.id)
    matchedNew.add(p.idx)
    match.set(p.old.id, p.idx)
  }

  for (const old of oldRows) {
    const treesHere = trees.filter((t) => t.posKey.startsWith(`${old.id}:`))
    const idx = match.get(old.id)
    if (idx === undefined) {
      if (treesHere.length === 0) plan.deletes.push(old.id)
      else {
        plan.kept.push(old.id)
        plan.stays += treesHere.length
      }
      continue
    }
    const fresh = newRows[idx]
    const oldCoords = new Map(
      positionsForRow(block, old, state.nudges).map((p) => [p.index, p.coord]),
    )
    const newCoords = positionsAlong(fresh.polyline, { by: 'count', count: fresh.count })
    const orphanIndexes: number[] = []
    for (const t of treesHere) {
      const index = Number(t.posKey.slice(old.id.length + 1))
      const before = oldCoords.get(index)
      const after = newCoords[index - 1]
      if (!after) {
        orphanIndexes.push(index)
        plan.orphans += 1
      } else if (before && distanceFt(before, after) <= treeSpacingFt / 2) plan.stays += 1
      else plan.moves += 1
    }
    plan.updates.push({
      rowId: old.id,
      polyline: fresh.polyline,
      count: fresh.count,
      orphanIndexes: orphanIndexes.sort((a, b) => a - b),
    })
  }
  newRows.forEach((n, idx) => {
    if (!matchedNew.has(idx)) plan.creates.push(n)
  })
  return plan
}

/** Position keys that would no longer be generated after the plan. */
export function orphanKeys(plan: RelayoutPlan): string[] {
  return plan.updates.flatMap((u) => u.orphanIndexes.map((i) => rowPosKey(u.rowId, i)))
}
