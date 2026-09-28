import { describe, expect, it } from 'vitest'
import { formatFeet, lengthLabels } from '@/engine/measure'
import { measureFC } from '@/map/useMapLayers'
import { fromLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
/** East and north in feet from a corner, so the expected lengths are obvious. */
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])

describe('writing a length', () => {
  it('uses whole feet, with a tenth only for short sides', () => {
    expect(formatFeet(240.4)).toBe('240 ft')
    expect(formatFeet(1234.6)).toBe('1,235 ft')
    expect(formatFeet(7.26)).toBe('7.3 ft')
  })
})

describe('the sides of a block outline', () => {
  it('labels all four sides of a rectangle, including the one back to the start', () => {
    const labels = lengthLabels([at(0, 0), at(300, 0), at(300, 120), at(0, 120)], true)
    expect(labels.map((l) => l.text)).toEqual(['300 ft', '120 ft', '300 ft', '120 ft'])
    expect(labels.every((l) => l.kind === 'side')).toBe(true)
  })

  it('puts each label halfway along its side', () => {
    const [first] = lengthLabels([at(0, 0), at(300, 0), at(300, 120)], true)
    const mid = at(150, 0)
    expect(first!.at[0]).toBeCloseTo(mid[0], 7)
    expect(first!.at[1]).toBeCloseTo(mid[1], 7)
  })

  it('does not label the drawing tool doubling a corner as a side', () => {
    // While an outline is drawn the shape arrives with repeated corners.
    const labels = lengthLabels([at(0, 0), at(0, 0), at(300, 0), at(300, 0), at(300, 120)], true)
    expect(labels.map((l) => l.text)).toEqual(['300 ft', '120 ft', '323 ft'])
  })

  it('shows the side to the cursor from the second corner, which is what drawing needs', () => {
    // One corner placed and the cursor 240 ft east: one side, measured live.
    const labels = lengthLabels([at(0, 0), at(240, 0)], true)
    expect(labels.map((l) => l.text)).toEqual(['240 ft'])
  })

  it('says nothing for a single point', () => {
    expect(lengthLabels([at(0, 0)], true)).toEqual([])
    expect(lengthLabels([at(0, 0), at(0, 0)], false)).toEqual([])
  })
})

describe('a row', () => {
  it('labels a straight row with its length and nothing more', () => {
    const labels = lengthLabels([at(0, 0), at(250, 0)], false)
    expect(labels.map((l) => l.text)).toEqual(['250 ft'])
  })

  it('adds the whole length at the far end when the row bends', () => {
    const labels = lengthLabels([at(0, 0), at(150, 0), at(150, 90)], false)
    expect(labels.map((l) => l.text)).toEqual(['150 ft', '90 ft', '240 ft in all'])
    const total = labels[2]!
    expect(total.kind).toBe('total')
    expect(total.at).toEqual(at(150, 90))
  })

  it('does not close a row back to its start', () => {
    expect(lengthLabels([at(0, 0), at(150, 0), at(150, 90)], false)).toHaveLength(3)
  })
})

describe('what the map layer receives', () => {
  it('is one labelled point per length', () => {
    const fc = measureFC([at(0, 0), at(150, 0), at(150, 90)], false)
    expect(fc.features).toHaveLength(3)
    expect(fc.features.map((f) => f.properties?.label)).toEqual([
      '150 ft',
      '90 ft',
      '240 ft in all',
    ])
    expect(fc.features[2]!.properties?.kind).toBe('total')
    expect(fc.features.every((f) => f.geometry.type === 'Point')).toBe(true)
  })
})
