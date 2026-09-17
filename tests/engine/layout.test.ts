import { describe, expect, it } from 'vitest'
import {
  allPositions,
  autoNumberRows,
  blockAreaSqFt,
  describeNumbering,
  occupiedMaxIndex,
  positionsForRow,
  rowUpBearing,
} from '@/engine/layout'
import { fromLocal, toLocal } from '@/engine/geo'
import { materialize } from '@/events/reduce'
import type { Block, LngLat, Row } from '@/model/types'
import { seedEvents } from '../ui/fixtures'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (eastFt: number, northFt: number): LngLat => fromLocal(ORIGIN, [eastFt, northFt])

const block: Block = {
  id: 'blk_1',
  code: 'PP1',
  name: 'Pawpaws',
  numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
  rowSpacingFt: 16,
  createdAt: 1,
  updatedAt: 1,
}

const row = (id: string, number: number, eastOffset: number, dir = 1): Row => ({
  id,
  blockId: 'blk_1',
  number,
  polyline:
    dir > 0 ? [at(eastOffset, 0), at(eastOffset, 220)] : [at(eastOffset, 220), at(eastOffset, 0)],
  layout: { by: 'count', count: 21 },
  createdAt: 1,
  updatedAt: 1,
})

describe('positions and labels', () => {
  it('labels positions from the start vertex and applies nudges', () => {
    const r = row('row_1', 3, 0)
    const moved: LngLat = at(5, 110)
    const pts = positionsForRow(block, r, { 'row_1:12': moved })
    expect(pts).toHaveLength(21)
    expect(pts[0].label).toBe('PP1-3-1')
    expect(pts[20].label).toBe('PP1-3-21')
    expect(pts[11].coord).toEqual(moved)
    expect(pts[11].nudged).toBe(true)
    expect(pts[10].nudged).toBe(false)
    expect(toLocal(ORIGIN, pts[10].coord)[1]).toBeCloseTo(110, 6)
  })

  it('lists every position in the seeded farm, loose ones last', () => {
    const s = materialize(seedEvents())
    const all = allPositions(s)
    expect(all).toHaveLength(20)
    expect(all[0].label).toBe('PP1-1-1')
    expect(all[10].label).toBe('PP1-2-1')
    expect(occupiedMaxIndex(s, 'row_1')).toBe(1)
    expect(occupiedMaxIndex(s, 'row_2')).toBe(0)
  })
})

describe('block facts', () => {
  it('prefers the planner area, then the outline, then rows times spacing', () => {
    const rows = [row('a', 1, 0), row('b', 2, 16)]
    expect(blockAreaSqFt(block, rows)).toBeCloseTo(2 * 220 * 16, 3)
    const outlined: Block = { ...block, outline: [ORIGIN, at(100, 0), at(100, 100), at(0, 100)] }
    expect(blockAreaSqFt(outlined, rows)).toBeCloseTo(10_000, 3)
    const linked: Block = {
      ...outlined,
      planner: { plantingId: 'pl', rowLengthFt: 220, rowWidthFt: 16, rows: 8 },
    }
    expect(blockAreaSqFt(linked, rows)).toBe(220 * 16 * 8)
    expect(blockAreaSqFt({ ...block, rowSpacingFt: undefined }, rows)).toBe(0)
  })

  it('describes the numbering in a sentence', () => {
    expect(describeNumbering(block)).toBe(
      'Rows are numbered from the west; position 1 is at the road end.',
    )
    expect(
      describeNumbering({ ...block, numbering: { rowsFrom: 'N', positionsFrom: 'barn end' } }),
    ).toBe('Rows are numbered from the north; position 1 is at the barn end.')
    expect(describeNumbering({ ...block, numbering: { rowsFrom: 'E', positionsFrom: '' } })).toBe(
      'Rows are numbered from the east; position 1 is at the start of the row.',
    )
  })

  it('numbers rows along the chosen side', () => {
    const rows = [row('c', 9, 32), row('a', 9, 0), row('b', 9, 16)]
    expect(autoNumberRows(rows, 'W')).toEqual([
      { id: 'a', number: 1 },
      { id: 'b', number: 2 },
      { id: 'c', number: 3 },
    ])
    expect(autoNumberRows(rows, 'E').map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('finds the bearing that stands rows upright, whichever way they were drawn', () => {
    expect(rowUpBearing([row('a', 1, 0), row('b', 2, 16, -1)])).toBeCloseTo(0, 4)
    const eastWest: Row = { ...row('e', 1, 0), polyline: [ORIGIN, at(200, 0)] }
    expect(rowUpBearing([eastWest])).toBeCloseTo(90, 4)
  })
})
