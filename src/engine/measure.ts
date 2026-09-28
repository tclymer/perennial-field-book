/**
 * Lengths written on the map while a shape is drawn or dragged. Planting a block that does not
 * show on the imagery yet means drawing it to dimensions you already know, and that is only
 * possible if the map says how long each side is as you go.
 */
import type { LngLat } from '@/model/types'
import { distanceFt } from './geo'

export interface LengthLabel {
  /** Where the label sits: the middle of a side, or the far end of a line for its total. */
  at: LngLat
  text: string
  kind: 'side' | 'total'
}

/** Whole feet, except under ten feet where a tenth still means something. */
export function formatFeet(ft: number): string {
  if (ft < 10) return `${Math.round(ft * 10) / 10} ft`
  return `${Math.round(ft).toLocaleString()} ft`
}

/** Sides shorter than this are the drawing tool's own doubled points, not sides. */
const MIN_SIDE_FT = 0.5

/**
 * A label on every side of a shape. A closed shape also gets the side back to its first
 * corner, which is what a block outline looks like while it is drawn. An open line of more
 * than one side also gets its total at the far end, since a row's length is the number that
 * matters and a row with a bend is otherwise a sum to do in your head.
 */
export function lengthLabels(coords: readonly LngLat[], closed: boolean): LengthLabel[] {
  const pts: LngLat[] = []
  for (const c of coords) {
    const last = pts[pts.length - 1]
    if (!last || distanceFt(last, c) >= MIN_SIDE_FT) pts.push(c)
  }
  if (closed && pts.length > 2 && distanceFt(pts[0]!, pts[pts.length - 1]!) < MIN_SIDE_FT) {
    pts.pop()
  }
  if (pts.length < 2) return []

  const out: LengthLabel[] = []
  const sides = closed && pts.length > 2 ? pts.length : pts.length - 1
  let total = 0
  for (let i = 0; i < sides; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    const ft = distanceFt(a, b)
    total += ft
    out.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], text: formatFeet(ft), kind: 'side' })
  }
  if (!closed && sides > 1) {
    out.push({ at: pts[pts.length - 1]!, text: `${formatFeet(total)} in all`, kind: 'total' })
  }
  return out
}
