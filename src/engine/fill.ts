/**
 * Fill a block outline with parallel rows of trees. Rows run along a heading (by default
 * the outline's first edge), spaced apart by the row spacing, inset from the outline, with
 * trees every in-row spacing. "Diamond" staggers every other row by half a tree spacing.
 */
import type { LngLat, Polyline, Ring } from '@/model/types'
import { fromLocal, headingDeg, toLocal, type XY } from './geo'

export type FillPattern = 'square' | 'diamond'

export interface FillOptions {
  /** Compass heading the rows run along; position 1 is at the start of that direction. */
  headingDeg: number
  rowSpacingFt: number
  treeSpacingFt: number
  /** Distance from the outline to the first row and to the first and last trees. */
  insetFt: number
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

export function fillOutline(outline: Ring, o: FillOptions): FilledRow[] {
  if (outline.length < 3 || o.rowSpacingFt <= 0 || o.treeSpacingFt <= 0) return []
  const origin = outline[0]
  const theta = (o.headingDeg * Math.PI) / 180
  const poly = outline.map((p) => toRow(toLocal(origin, p), theta))
  const vs = poly.map((p) => p[1])
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const inset = Math.max(0, o.insetFt)
  const rows: FilledRow[] = []
  let index = 0
  for (let v = vMin + inset; v <= vMax - inset + 1e-6; v += o.rowSpacingFt) {
    for (const [u0, u1] of crossings(poly, v)) {
      const stagger = o.pattern === 'diamond' && index % 2 === 1 ? o.treeSpacingFt / 2 : 0
      const start = u0 + inset + stagger
      const end = u1 - inset
      if (end < start - 1e-6) continue
      const count = Math.floor((end - start) / o.treeSpacingFt + 1e-6) + 1
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
