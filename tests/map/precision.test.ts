import { describe, expect, it } from 'vitest'
import { DRAW_PRECISION, decimalsOf, positionsAlong, snapCoord } from '@/engine/geo'
import { fillOutline } from '@/engine/fill'
import { positionsForRow } from '@/engine/layout'
import type { Block, LngLat, Ring, Row } from '@/model/types'

// A drawing library that refuses coordinates finer than DRAW_PRECISION and drops those
// shapes without raising. Anything generated has to survive this to be editable at all.
function drawable(c: LngLat): boolean {
  return decimalsOf(c[0]) <= DRAW_PRECISION && decimalsOf(c[1]) <= DRAW_PRECISION
}

const OUTLINE: Ring = [
  [-77.084, 40.179],
  [-77.0834, 40.179],
  [-77.0834, 40.1786],
  [-77.084, 40.1786],
]

describe('coordinates handed to the map editor', () => {
  it('rounds to a precision the drawing library accepts', () => {
    const c = snapCoord([-77.08316363636364, 40.17935123456789])
    expect(drawable(c)).toBe(true)
    // Nine decimals of longitude is well under a millimetre, so the point has not moved.
    expect(Math.abs(c[0] - -77.08316363636364)).toBeLessThan(1e-8)
  })

  it('leaves a coordinate that is already coarse enough alone', () => {
    expect(snapCoord([-77.0832, 40.17935])).toEqual([-77.0832, 40.17935])
  })

  it('has something to fix: generated rows and positions are full floats', () => {
    const rows = fillOutline(OUTLINE, {
      rowSpacingFt: 16,
      treeSpacingFt: 10,
      headingDeg: 90,
      insetFt: 5,
      pattern: 'square',
    })
    expect(rows.length).toBeGreaterThan(0)
    // Without rounding these would be silently refused, which is the bug this guards.
    expect(rows.some((r) => r.polyline.some((c) => !drawable(c)))).toBe(true)
  })

  it('makes every row line drawable once snapped', () => {
    const rows = fillOutline(OUTLINE, {
      rowSpacingFt: 16,
      treeSpacingFt: 10,
      headingDeg: 90,
      insetFt: 5,
      pattern: 'square',
    })
    for (const r of rows) {
      for (const c of r.polyline) expect(drawable(snapCoord(c))).toBe(true)
    }
  })

  it('makes every tree position in a row drawable once snapped', () => {
    const block = { id: 'blk', code: 'GH' } as Block
    const row = {
      id: 'row_1',
      blockId: 'blk',
      number: 1,
      polyline: [
        [-77.0832, 40.17935],
        [-77.0828, 40.17935],
      ],
      layout: { by: 'count', count: 12 },
    } as Row
    const ps = positionsForRow(block, row, {})
    expect(ps).toHaveLength(12)
    // The interpolated ones are the trouble; the two ends come straight from the polyline.
    expect(ps.filter((p) => !drawable(p.coord)).length).toBeGreaterThan(0)
    for (const p of ps) expect(drawable(snapCoord(p.coord))).toBe(true)
  })

  it('snaps points taken straight along a line too', () => {
    const line: LngLat[] = [
      [-77.0832, 40.17935],
      [-77.0828, 40.17935],
    ]
    for (const c of positionsAlong(line, { by: 'count', count: 7 })) {
      expect(drawable(snapCoord(c))).toBe(true)
    }
  })
})
