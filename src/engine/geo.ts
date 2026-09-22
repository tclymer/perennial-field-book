/**
 * Small-area geometry in feet. A local plane at the first vertex is accurate to well under
 * a foot across a farm, which is all a row layout needs. Pure functions, no map library.
 */
import type { LngLat, Polyline, Ring, RowLayout } from '@/model/types'

export const FT_PER_M = 3.28084
const M_PER_DEG_LAT = 111_320

export type XY = [x: number, y: number]
export type Bounds = [west: number, south: number, east: number, north: number]

function ftPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) * FT_PER_M
}

/** Feet east and north of `origin`. */
/**
 * Decimals a coordinate may carry when it is handed to the drawing library, which refuses
 * anything finer and drops those shapes without raising. Generated coordinates are full
 * floats, so rows, outlines, and tree positions all have to be rounded on the way out.
 * Nine decimals is under a tenth of a millimetre, so nothing on a farm notices.
 */
export const DRAW_PRECISION = 9
const DRAW_FACTOR = 10 ** DRAW_PRECISION

export function snapCoord(p: LngLat): LngLat {
  return [
    Math.round(p[0] * DRAW_FACTOR) / DRAW_FACTOR,
    Math.round(p[1] * DRAW_FACTOR) / DRAW_FACTOR,
  ]
}

/** How many decimals a number is written with, for checking a coordinate is safe to draw. */
export function decimalsOf(n: number): number {
  const s = String(n)
  const dot = s.indexOf('.')
  if (dot < 0 || s.includes('e') || s.includes('E')) return 0
  return s.length - dot - 1
}

export function toLocal(origin: LngLat, p: LngLat): XY {
  return [
    (p[0] - origin[0]) * ftPerDegLon(origin[1]),
    (p[1] - origin[1]) * M_PER_DEG_LAT * FT_PER_M,
  ]
}

export function fromLocal(origin: LngLat, xy: XY): LngLat {
  return [
    origin[0] + xy[0] / ftPerDegLon(origin[1]),
    origin[1] + xy[1] / (M_PER_DEG_LAT * FT_PER_M),
  ]
}

export function distanceFt(a: LngLat, b: LngLat): number {
  const [x, y] = toLocal(a, b)
  return Math.hypot(x, y)
}

export function polylineLengthFt(line: Polyline): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += distanceFt(line[i - 1], line[i])
  return total
}

/** The point `distFt` along the line from its first vertex, clamped to the ends. */
export function pointAlong(line: Polyline, distFt: number): LngLat {
  if (line.length === 0) throw new Error('empty polyline')
  if (line.length === 1 || distFt <= 0) return line[0]
  let remaining = distFt
  for (let i = 1; i < line.length; i++) {
    const seg = distanceFt(line[i - 1], line[i])
    if (remaining <= seg) {
      if (seg === 0) return line[i]
      const t = remaining / seg
      const a = line[i - 1]
      const b = line[i]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= seg
  }
  return line[line.length - 1]
}

/**
 * Where the trees stand along a row. By count: evenly spread so the first and last trees
 * sit at the ends. By spacing: every `spacingFt` from the start, as many as fit.
 */
export function positionsAlong(line: Polyline, layout: RowLayout): LngLat[] {
  const length = polylineLengthFt(line)
  if (layout.by === 'count') {
    const n = Math.max(1, Math.round(layout.count))
    if (n === 1) return [line[0]]
    return Array.from({ length: n }, (_, i) => pointAlong(line, (i * length) / (n - 1)))
  }
  const s = layout.spacingFt
  const n = s > 0 ? Math.floor(length / s + 1e-6) + 1 : 1
  return Array.from({ length: n }, (_, i) => pointAlong(line, i * s))
}

/** How many positions a layout yields on a line. */
export function positionCount(line: Polyline, layout: RowLayout): number {
  return positionsAlong(line, layout).length
}

/** Compass bearing from the first vertex to the last: 0 north, 90 east. */
export function headingDeg(line: Polyline): number {
  if (line.length < 2) return 0
  const [x, y] = toLocal(line[0], line[line.length - 1])
  const deg = (Math.atan2(x, y) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Mean of compass bearings that treats 350° and 10° as neighbors. */
export function circularMeanDeg(angles: number[]): number {
  if (angles.length === 0) return 0
  let sx = 0
  let sy = 0
  for (const a of angles) {
    sx += Math.sin((a * Math.PI) / 180)
    sy += Math.cos((a * Math.PI) / 180)
  }
  const deg = (Math.atan2(sx, sy) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Absolute shoelace area of a ring in the local plane, square feet. */
export function polygonAreaSqFt(ring: Ring): number {
  if (ring.length < 3) return 0
  const origin = ring[0]
  const pts = ring.map((p) => toLocal(origin, p))
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export const SQFT_PER_ACRE = 43_560

/**
 * How a farmer says an area out loud. A greenhouse bench or a trial row is a number of square
 * feet; anything approaching a tenth of an acre is acres. Nobody thinks of 4,000 sq ft as
 * 0.09 ac, and nobody thinks of three acres as 130,680 sq ft.
 */
export function areaLabel(sqft: number): string {
  if (sqft <= 0) return ''
  const acres = sqFtToAcres(sqft)
  return acres < 0.1 ? `${Math.round(sqft).toLocaleString()} sq ft` : `${acres.toFixed(2)} ac`
}

export function sqFtToAcres(sqft: number): number {
  return sqft / SQFT_PER_ACRE
}

export function centroid(points: LngLat[]): LngLat {
  if (points.length === 0) throw new Error('no points')
  let lon = 0
  let lat = 0
  for (const p of points) {
    lon += p[0]
    lat += p[1]
  }
  return [lon / points.length, lat / points.length]
}

export function bboxOf(points: LngLat[]): Bounds {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lon, lat] of points) {
    if (lon < w) w = lon
    if (lon > e) e = lon
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

/** Grow a bounding box by a margin in feet on every side. */
export function padBounds(b: Bounds, marginFt: number): Bounds {
  const midLat = (b[1] + b[3]) / 2
  const dLon = marginFt / ftPerDegLon(midLat)
  const dLat = marginFt / (M_PER_DEG_LAT * FT_PER_M)
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat]
}

export interface TileId {
  z: number
  x: number
  y: number
}

function lonToX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z
}

function latToY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

/** Every web-mercator tile that touches the bounds at each zoom, for offline saving. */
export function tilesForBounds(b: Bounds, zMin: number, zMax: number): TileId[] {
  const out: TileId[] = []
  for (let z = zMin; z <= zMax; z++) {
    const x0 = Math.floor(lonToX(b[0], z))
    const x1 = Math.floor(lonToX(b[2], z))
    const y0 = Math.floor(latToY(b[3], z))
    const y1 = Math.floor(latToY(b[1], z))
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y })
  }
  return out
}
