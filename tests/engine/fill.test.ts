import { describe, expect, it } from 'vitest'
import { fillOutline, fillSummary, firstEdgeHeading } from '@/engine/fill'
import { distanceFt, fromLocal, toLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
// A 100 ft wide, 200 ft tall rectangle drawn from its south-west corner northward.
const rect = [at(0, 0), at(0, 200), at(100, 200), at(100, 0)]

describe('outline fill', () => {
  it('takes the heading from the first edge', () => {
    expect(firstEdgeHeading(rect)).toBeCloseTo(0, 6)
    expect(firstEdgeHeading([at(0, 0), at(50, 0)])).toBeCloseTo(90, 6)
  })

  it('lays rows along the heading, inset from the outline, trees on spacing', () => {
    const rows = fillOutline(rect, {
      headingDeg: 0,
      rowSpacingFt: 20,
      treeSpacingFt: 10,
      insetFt: 10,
      pattern: 'square',
    })
    expect(fillSummary(rows)).toEqual({ rows: 5, trees: 5 * 19 })
    const first = rows[0]
    const [x0, y0] = toLocal(ORIGIN, first.polyline[0])
    const [x1, y1] = toLocal(ORIGIN, first.polyline[1])
    // Position 1 sits at the south end, 10 ft in; rows are 10, 30, ... ft from the west edge.
    expect(y0).toBeCloseTo(10, 4)
    expect(y1).toBeCloseTo(190, 4)
    expect(x0).toBeCloseTo(x1, 6)
    expect(Math.abs(x0)).toBeCloseTo(10, 4)
    expect(distanceFt(first.polyline[0], first.polyline[1])).toBeCloseTo(180, 4)
  })

  it('staggers every other row for a diamond pattern', () => {
    const rows = fillOutline(rect, {
      headingDeg: 0,
      rowSpacingFt: 20,
      treeSpacingFt: 10,
      insetFt: 10,
      pattern: 'diamond',
    })
    expect(rows[0].count).toBe(19)
    expect(rows[1].count).toBe(18)
    expect(Math.abs(toLocal(ORIGIN, rows[1].polyline[0])[1])).toBeCloseTo(15, 4)
  })

  it('follows a turned heading and clips to the shape', () => {
    // Same rectangle, rows running east-west instead.
    const rows = fillOutline(rect, {
      headingDeg: 90,
      rowSpacingFt: 20,
      treeSpacingFt: 10,
      insetFt: 10,
      pattern: 'square',
    })
    expect(fillSummary(rows)).toEqual({ rows: 10, trees: 10 * 9 })
    // A triangle gets shorter rows toward its point.
    const tri = [at(0, 0), at(0, 200), at(100, 0)]
    const t = fillOutline(tri, {
      headingDeg: 0,
      rowSpacingFt: 20,
      treeSpacingFt: 10,
      insetFt: 5,
      pattern: 'square',
    })
    expect(t.length).toBeGreaterThan(2)
    expect(t[0].count).toBeGreaterThan(t[t.length - 1].count)
  })

  it('returns nothing for bad input', () => {
    expect(
      fillOutline([at(0, 0), at(1, 1)], {
        headingDeg: 0,
        rowSpacingFt: 10,
        treeSpacingFt: 10,
        insetFt: 0,
        pattern: 'square',
      }),
    ).toEqual([])
    expect(
      fillOutline(rect, {
        headingDeg: 0,
        rowSpacingFt: 0,
        treeSpacingFt: 10,
        insetFt: 0,
        pattern: 'square',
      }),
    ).toEqual([])
  })
})
