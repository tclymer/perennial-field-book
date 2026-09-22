import { describe, expect, it } from 'vitest'
import { firstEdgeHeading } from '@/engine/fill'
import { areaLabel, fromLocal, headingDeg } from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
/** East and north in feet from a corner of the farm, so headings are easy to reason about. */
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])

/**
 * What the drawing library reports while a polygon is being drawn. The shape is created on
 * the first click with every corner at that point, and one corner then follows the cursor
 * until it is clicked. `committed` is how many have actually been placed.
 *
 * This mirrors Terra Draw's polygon mode: create with four identical coordinates, update the
 * trailing one on each mouse move, commit it on each click.
 */
function drawing(clicks: LngLat[], cursor: LngLat | null) {
  const committed = clicks.length
  const ring = cursor ? [...clicks, cursor] : [...clicks]
  while (ring.length < 3) ring.push(ring[ring.length - 1]!)
  return { committed, coordinates: ring }
}

/**
 * The rule the map editor follows: hold off until two corners have really been clicked, then
 * take the heading from the first edge and never change it.
 */
function lockAnchor(
  existing: { corner: LngLat; headingDeg: number } | null,
  frame: { committed: number; coordinates: LngLat[] },
) {
  if (existing) return existing
  if (frame.committed < 2) return null
  return { corner: frame.coordinates[0]!, headingDeg: firstEdgeHeading(frame.coordinates) }
}

describe('fixing the row direction while an outline is drawn', () => {
  it('ignores the corner that is only following the cursor', () => {
    // One click down, mouse wandering north while the row will actually run east.
    const first = at(0, 0)
    let anchor = lockAnchor(null, drawing([first], at(0, 80)))
    expect(anchor).toBeNull()
    anchor = lockAnchor(anchor, drawing([first], at(-30, 60)))
    expect(anchor).toBeNull()
  })

  it('takes the heading from the first edge once two corners are down', () => {
    const clicks = [at(0, 0), at(200, 0)]
    const anchor = lockAnchor(null, drawing(clicks, at(200, 90)))
    expect(anchor).not.toBeNull()
    // Due east.
    expect(Math.round(anchor!.headingDeg)).toBe(90)
    expect(anchor!.corner).toEqual(clicks[0])
  })

  it('keeps that heading however the rest of the outline is drawn', () => {
    const clicks = [at(0, 0), at(200, 0)]
    let anchor = lockAnchor(null, drawing(clicks, at(200, 90)))
    const locked = anchor!.headingDeg
    // Three more corners, the cursor swinging all over.
    anchor = lockAnchor(anchor, drawing([...clicks, at(200, 90)], at(-40, 120)))
    anchor = lockAnchor(anchor, drawing([...clicks, at(200, 90), at(0, 90)], at(0, 10)))
    expect(anchor!.headingDeg).toBe(locked)
  })

  it('is the bug it replaces: locking at one click follows the mouse', () => {
    // What the old rule did, for the record. The heading came out north because the mouse
    // happened to be north a moment after the first click, though the rows run east.
    const frame = drawing([at(0, 0)], at(0, 80))
    expect(frame.coordinates.length).toBeGreaterThanOrEqual(2)
    expect(Math.round(firstEdgeHeading(frame.coordinates))).toBe(0)
    // The rule now in force waits, and gets east.
    expect(lockAnchor(null, frame)).toBeNull()
    expect(Math.round(firstEdgeHeading(drawing([at(0, 0), at(200, 0)], null).coordinates))).toBe(90)
  })

  it('reads a heading in every quarter correctly', () => {
    const cases: [LngLat, number][] = [
      [at(0, 200), 0],
      [at(200, 0), 90],
      [at(0, -200), 180],
      [at(-200, 0), 270],
    ]
    for (const [second, want] of cases) {
      const anchor = lockAnchor(null, drawing([at(0, 0), second], at(10, 10)))
      expect(Math.round(((anchor!.headingDeg % 360) + 360) % 360)).toBe(want)
    }
  })
})

/** The turn that takes one heading to another, kept inside a quarter turn either way. */
function turnTo(want: number, from: number): number {
  let d = (((want - from) % 180) + 180) % 180
  if (d > 90) d -= 180
  return Math.round(d * 4) / 4
}

describe('turning rows to where they should have been', () => {
  it('reaches a heading square to the one it started with', () => {
    // The case that a forty five degree slider could not fix.
    expect(turnTo(90, 0)).toBe(90)
    expect(turnTo(0, 90)).toBe(90)
  })

  it('always stays within a quarter turn, because a row runs both ways', () => {
    for (let from = 0; from < 360; from += 7) {
      for (let want = 0; want < 360; want += 11) {
        const d = turnTo(want, from)
        expect(Math.abs(d)).toBeLessThanOrEqual(90)
        // Landing on the wanted direction, or on the same line pointing the other way.
        const got = (((from + d) % 180) + 180) % 180
        const target = ((want % 180) + 180) % 180
        expect(Math.min(Math.abs(got - target), 180 - Math.abs(got - target))).toBeLessThan(0.3)
      }
    }
  })

  it('does nothing when it is already right', () => {
    expect(turnTo(42, 42)).toBe(0)
    // And the same line the other way is already right too.
    expect(turnTo(222, 42)).toBe(0)
  })

  it('agrees with the heading helper on a real edge', () => {
    const h = headingDeg([at(0, 0), at(100, 100)])
    expect(Math.round(h)).toBe(45)
    expect(turnTo(h, 0)).toBeCloseTo(45, 0)
  })
})

describe('saying how big a place is', () => {
  it('uses square feet for anything under a tenth of an acre', () => {
    expect(areaLabel(500)).toBe('500 sq ft')
    expect(areaLabel(4000)).toBe('4,000 sq ft')
    // A tenth of an acre is 4,356 sq ft.
    expect(areaLabel(4355)).toMatch(/sq ft/)
  })

  it('uses acres from a tenth of an acre up', () => {
    expect(areaLabel(4356)).toBe('0.10 ac')
    expect(areaLabel(43560)).toBe('1.00 ac')
    expect(areaLabel(98010)).toBe('2.25 ac')
  })

  it('says nothing at all for a place with no area', () => {
    expect(areaLabel(0)).toBe('')
    expect(areaLabel(-1)).toBe('')
  })
})
