import { describe, expect, it } from 'vitest'
import {
  circularMeanDeg,
  distanceFt,
  fromLocal,
  headingDeg,
  padBounds,
  pointAlong,
  polygonAreaSqFt,
  polylineLengthFt,
  positionsAlong,
  sqFtToAcres,
  tilesForBounds,
  toLocal,
} from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
/** A point `ft` feet east and north of the origin, built from the same math in reverse. */
const at = (eastFt: number, northFt: number): LngLat => fromLocal(ORIGIN, [eastFt, northFt])

describe('local plane', () => {
  it('round-trips and measures known distances', () => {
    const p = at(100, 0)
    expect(toLocal(ORIGIN, p)[0]).toBeCloseTo(100, 6)
    expect(distanceFt(ORIGIN, at(300, 400))).toBeCloseTo(500, 6)
    // One degree of latitude is about 364,000 feet.
    expect(distanceFt([-77, 40], [-77, 41])).toBeGreaterThan(363_000)
    expect(distanceFt([-77, 40], [-77, 41])).toBeLessThan(366_000)
  })

  it('measures a row with a turn as the sum of its legs', () => {
    expect(polylineLengthFt([ORIGIN, at(120, 0), at(120, 50)])).toBeCloseTo(170, 6)
    expect(polylineLengthFt([ORIGIN])).toBe(0)
  })

  it('walks along a line and clamps at the ends', () => {
    const line = [ORIGIN, at(100, 0), at(100, 100)]
    expect(toLocal(ORIGIN, pointAlong(line, 150))).toEqual([
      expect.closeTo(100, 6),
      expect.closeTo(50, 6),
    ])
    expect(pointAlong(line, -5)).toEqual(ORIGIN)
    expect(pointAlong(line, 999)).toEqual(line[2])
  })
})

describe('positions along a row', () => {
  const line = [ORIGIN, at(180, 0)]

  it('by count puts the first and last tree at the ends', () => {
    const pts = positionsAlong(line, { by: 'count', count: 10 })
    expect(pts).toHaveLength(10)
    expect(pts[0]).toEqual(ORIGIN)
    expect(toLocal(ORIGIN, pts[9])[0]).toBeCloseTo(180, 6)
    expect(toLocal(ORIGIN, pts[1])[0]).toBeCloseTo(20, 6)
    expect(positionsAlong(line, { by: 'count', count: 1 })).toEqual([ORIGIN])
  })

  it('by spacing fills from the start with as many as fit', () => {
    const pts = positionsAlong(line, { by: 'spacing', spacingFt: 11 })
    expect(pts).toHaveLength(17)
    expect(toLocal(ORIGIN, pts[16])[0]).toBeCloseTo(176, 6)
    expect(positionsAlong(line, { by: 'spacing', spacingFt: 500 })).toEqual([ORIGIN])
    // Exactly divisible lengths include the far end.
    expect(positionsAlong(line, { by: 'spacing', spacingFt: 18 })).toHaveLength(11)
  })

  it('follows a turn', () => {
    const bent = [ORIGIN, at(100, 0), at(100, 100)]
    const pts = positionsAlong(bent, { by: 'count', count: 5 })
    expect(toLocal(ORIGIN, pts[2])).toEqual([expect.closeTo(100, 6), expect.closeTo(0, 6)])
    expect(toLocal(ORIGIN, pts[3])).toEqual([expect.closeTo(100, 6), expect.closeTo(50, 6)])
  })
})

describe('bearings and areas', () => {
  it('reads compass headings and averages them around north', () => {
    expect(headingDeg([ORIGIN, at(0, 100)])).toBeCloseTo(0, 6)
    expect(headingDeg([ORIGIN, at(100, 0)])).toBeCloseTo(90, 6)
    expect(headingDeg([ORIGIN, at(0, -100)])).toBeCloseTo(180, 6)
    expect(headingDeg([ORIGIN, at(-100, 100)])).toBeCloseTo(315, 6)
    expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 6)
    expect(circularMeanDeg([80, 100])).toBeCloseTo(90, 6)
  })

  it('computes the area of a square in acres', () => {
    const ring = [ORIGIN, at(100, 0), at(100, 100), at(0, 100)]
    expect(polygonAreaSqFt(ring)).toBeCloseTo(10_000, 3)
    expect(sqFtToAcres(43_560)).toBe(1)
    expect(polygonAreaSqFt([ORIGIN, at(1, 1)])).toBe(0)
  })

  it('pads bounds and lists tiles', () => {
    const b = padBounds([-77.0835, 40.179, -77.0828, 40.1795], 100)
    expect(b[0]).toBeLessThan(-77.0835)
    expect(b[3]).toBeGreaterThan(40.1795)
    const tiles = tilesForBounds([-77.0835, 40.179, -77.0828, 40.1795], 18, 19)
    expect(tiles.length).toBeGreaterThan(4)
    expect(tiles.every((t) => t.z === 18 || t.z === 19)).toBe(true)
    expect(tiles.some((t) => t.z === 19 && t.x === 149883 && t.y === 198142)).toBe(true)
  })
})
