/**
 * Rigid moves of a whole block: slide along and across its rows and turn about its center.
 * Every row, tree, and the outline move together, so nothing changes relative to anything
 * else and every record keeps its meaning.
 */
import type { LngLat } from '@/model/types'
import { fromLocal, toLocal, type XY } from './geo'

export interface RigidMove {
  /** Compass heading that "along" follows. */
  headingDeg: number
  alongFt: number
  acrossFt: number
  /** Degrees clockwise about `pivot`. */
  rotateDeg: number
  pivot: LngLat
}

export function isIdentity(m: RigidMove): boolean {
  return m.alongFt === 0 && m.acrossFt === 0 && m.rotateDeg === 0
}

/** Apply the move to one point. */
export function movePoint(p: LngLat, m: RigidMove): LngLat {
  const theta = (m.headingDeg * Math.PI) / 180
  const rot = (m.rotateDeg * Math.PI) / 180
  const [x, y] = toLocal(m.pivot, p)
  // Rotate about the pivot (clockwise on a map means x' = x cos + y sin, y' = -x sin + y cos).
  const rx = x * Math.cos(rot) + y * Math.sin(rot)
  const ry = -x * Math.sin(rot) + y * Math.cos(rot)
  // Then slide: along the heading and across it (to the right).
  const along: XY = [Math.sin(theta), Math.cos(theta)]
  const across: XY = [Math.cos(theta), -Math.sin(theta)]
  return fromLocal(m.pivot, [
    rx + m.alongFt * along[0] + m.acrossFt * across[0],
    ry + m.alongFt * along[1] + m.acrossFt * across[1],
  ])
}

export function movePoints(points: LngLat[], m: RigidMove): LngLat[] {
  return points.map((p) => movePoint(p, m))
}

export function centroidOf(points: LngLat[]): LngLat {
  if (points.length === 0) throw new Error('no points')
  let lon = 0
  let lat = 0
  for (const p of points) {
    lon += p[0]
    lat += p[1]
  }
  return [lon / points.length, lat / points.length]
}
