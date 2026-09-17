/**
 * Fill a block outline with parallel rows of trees. Rows run along a heading (by default
 * the outline's first edge), spaced apart by the row spacing, inset from the outline, with
 * trees every in-row spacing. "Diamond" staggers every other row by half a tree spacing.
 * Shifts slide the whole pattern along or across the rows without changing the margins.
 */
import type { LngLat, Polyline, Ring } from '@/model/types'
import { fromLocal, headingDeg, toLocal, type XY } from './geo'

export type FillPattern = 'square' | 'diamond'

export interface FillOptions {
  /** Compass heading the rows run along; position 1 is at the start of that direction. */
  headingDeg: number
  rowSpacingFt: number
  treeSpacingFt: number
  /** Distance from the outline's sides to the first and last rows. */
  insetFt: number
  /** Distance from the outline's ends to the first and last trees. Defaults to `insetFt`. */
  insetEndFt?: number
  /** Slide every tree this far along the rows (positive toward the far end). */
  shiftAlongFt?: number
  /** Slide every row this far across (positive to the right of the heading). */
  shiftAcrossFt?: number
  pattern: FillPattern
}

export interface FilledRow {
  /** From the first tree to the last tree. */
  polyline: Polyline
  count: number
}

/** The heading of the outline's first edge, which the user drew first. */
export function firstEdgeHeading(outline: Ring): number {
  return outline.length >= 2 ? headingDeg([outline[0], outline[1]]) : 0
}

/** Rotate local feet into row coordinates: u along the heading, v to its right. */
function toRow(p: XY, theta: number): XY {
  const s = Math.sin(theta)
  const c = Math.cos(theta)
  return [p[0] * s + p[1] * c, p[0] * c - p[1] * s]
}

function fromRow(uv: XY, theta: number): XY {
  const s = Math.sin(theta)
  const c = Math.cos(theta)
  return [uv[0] * s + uv[1] * c, uv[0] * c - uv[1] * s]
}

/** Where a line of constant v crosses the polygon, as sorted u intervals inside it. */
function crossings(poly: XY[], v: number): [number, number][] {
  const us: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (a[1] === b[1]) continue
    if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) {
      us.push(a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]))
    }
  }
  us.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < us.length; i += 2) out.push([us[i], us[i + 1]])
  return out
}

const EPS = 1e-6

export function fillOutline(outline: Ring, o: FillOptions): FilledRow[] {
  if (outline.length < 3 || o.rowSpacingFt <= 0 || o.treeSpacingFt <= 0) return []
  const origin = outline[0]
  const theta = (o.headingDeg * Math.PI) / 180
  const poly = outline.map((p) => toRow(toLocal(origin, p), theta))
  const vs = poly.map((p) => p[1])
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const insetSide = Math.max(0, o.insetFt)
  const insetEnd = Math.max(0, o.insetEndFt ?? o.insetFt)
  const shiftAlong = o.shiftAlongFt ?? 0
  const shiftAcross = o.shiftAcrossFt ?? 0
  const rows: FilledRow[] = []
  let index = 0
  // Rows start at the first side plus the inset, then step; a shift may push the first row
  // past the inset or pull it back toward the edge, but never outside the outline.
  const vStart = vMin + insetSide + shiftAcross
  for (let v = vStart; v <= vMax - insetSide + EPS; v += o.rowSpacingFt) {
    if (v < vMin - EPS) {
      index += 1
      continue
    }
    for (const [u0, u1] of crossings(poly, v)) {
      const stagger = o.pattern === 'diamond' && index % 2 === 1 ? o.treeSpacingFt / 2 : 0
      const lo = Math.max(u0, u0 + insetEnd + shiftAlong)
      const hi = u1 - insetEnd
      // First tree on the shifted grid at or after `lo`.
      const gridStart = u0 + insetEnd + shiftAlong + stagger
      const k0 = Math.max(0, Math.ceil((lo - gridStart) / o.treeSpacingFt - EPS))
      const start = gridStart + k0 * o.treeSpacingFt
      if (hi < start - EPS) continue
      const count = Math.floor((hi - start) / o.treeSpacingFt + EPS) + 1
      const last = start + (count - 1) * o.treeSpacingFt
      const toLngLat = (u: number): LngLat => fromLocal(origin, fromRow([u, v], theta))
      const polyline: Polyline =
        count === 1 ? [toLngLat(start), toLngLat(start + 1)] : [toLngLat(start), toLngLat(last)]
      rows.push({ polyline, count })
    }
    index += 1
  }
  return rows
}

export function fillSummary(rows: FilledRow[]): { rows: number; trees: number } {
  return { rows: rows.length, trees: rows.reduce((n, r) => n + r.count, 0) }
}
