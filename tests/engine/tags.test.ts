import { describe, expect, it } from 'vitest'
import {
  formatTagId,
  normalizeTagId,
  routeForTarget,
  tagIdFromUrl,
  tagUrl,
  targetMissing,
} from '@/engine/tags'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'

describe('a tag serial', () => {
  it('takes the shapes readers hand it over in', () => {
    expect(normalizeTagId('04:A1:B2:C3:D4:E5:F6')).toBe('04a1b2c3d4e5f6')
    expect(normalizeTagId('04 a1 b2 c3 d4 e5 f6')).toBe('04a1b2c3d4e5f6')
    expect(normalizeTagId('04-a1-b2-c3-d4-e5-f6')).toBe('04a1b2c3d4e5f6')
    expect(normalizeTagId('04a1b2c3d4e5f6')).toBe('04a1b2c3d4e5f6')
  })

  it('refuses what is not a serial', () => {
    expect(normalizeTagId('')).toBeNull()
    expect(normalizeTagId('hello')).toBeNull()
    expect(normalizeTagId('04a1')).toBeNull()
    // Hex always comes in whole bytes.
    expect(normalizeTagId('04a1b2c3d')).toBeNull()
  })

  it('reads back to a person the way a reader prints it', () => {
    expect(formatTagId('04a1b2c3d4e5f6')).toBe('04:A1:B2:C3:D4:E5:F6')
  })
})

describe('the link written to a tag', () => {
  it('names the tag, not what it is on', () => {
    const url = tagUrl('https://fieldbook.example.org', '04a1b2c3d4e5f6')
    expect(url).toBe('https://fieldbook.example.org/#/tag/04a1b2c3d4e5f6')
    // Nothing about the tree is in it, which is why the tag never needs rewriting.
    expect(url).not.toMatch(/GH|row|PP1/)
  })

  it('survives a trailing slash on the origin', () => {
    expect(tagUrl('https://x.org/', 'aabbccdd')).toBe('https://x.org/#/tag/aabbccdd')
  })

  it('reads its own links back', () => {
    expect(tagIdFromUrl('https://x.org/#/tag/04A1B2C3D4E5F6')).toBe('04a1b2c3d4e5f6')
    expect(tagIdFromUrl('https://x.org/#/t/GH-1-3')).toBeNull()
    expect(tagIdFromUrl('nonsense')).toBeNull()
  })
})

const SEED: NewEvent[] = [
  {
    type: 'farm.create',
    payload: { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 },
  },
  {
    type: 'block.create',
    payload: {
      id: 'blk',
      code: 'GH',
      name: 'Greenhouse',
      numbering: { rowsFrom: 'W', positionsFrom: 'the door' },
    },
  },
  {
    type: 'row.create',
    payload: {
      id: 'row_1',
      blockId: 'blk',
      number: 1,
      polyline: [
        [-77.0832, 40.17935],
        [-77.0828, 40.17935],
      ],
      layout: { by: 'count', count: 12 },
    },
  },
  {
    type: 'feature.create',
    payload: {
      id: 'ftr',
      name: 'Blue House',
      kind: 'greenhouse',
      geometry: { type: 'Point', coordinates: [-77.083, 40.1796] },
    },
  },
]

function state(extra: NewEvent[] = []) {
  return materialize(
    [...SEED, ...extra].map((e, i) => ({
      id: `evt_${i}`,
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000 + i,
      ...e,
    })) as AnyEvent[],
  )
}

describe('where a tag sends you', () => {
  it('opens a tree by the number it carries today, not the one it had when tagged', () => {
    const s = state()
    expect(routeForTarget(s, { kind: 'tree', posKey: 'row_1:4' }, 'GH-1-4')).toBe('/t/GH-1-4')
    // After thinning, the same key resolves to a different label, and the route follows it.
    const thinned = state([{ type: 'row.patch', payload: { id: 'row_1', skips: [1] } }])
    expect(routeForTarget(thinned, { kind: 'tree', posKey: 'row_1:4' }, 'GH-1-3')).toBe('/t/GH-1-3')
  })

  it('opens a block, a row, and a building', () => {
    const s = state()
    expect(routeForTarget(s, { kind: 'block', id: 'blk' }, '')).toBe('/blocks/blk/grid')
    expect(routeForTarget(s, { kind: 'row', id: 'row_1' }, '')).toBe('/blocks/blk/grid')
    expect(routeForTarget(s, { kind: 'feature', id: 'ftr' }, '')).toBe('/?feature=ftr')
  })
})

describe('a tag whose place is gone', () => {
  it('notices a deleted block, row, or building', () => {
    const s = state([
      { type: 'block.delete', payload: { id: 'blk' } },
      { type: 'feature.delete', payload: { id: 'ftr' } },
    ])
    expect(targetMissing(s, { kind: 'block', id: 'blk' })).toBe(true)
    expect(targetMissing(s, { kind: 'feature', id: 'ftr' })).toBe(true)
  })

  it('notices a spot taken out of a row, but not one that merely renumbered', () => {
    const thinned = state([{ type: 'row.patch', payload: { id: 'row_1', skips: [1] } }])
    expect(targetMissing(thinned, { kind: 'tree', posKey: 'row_1:1' })).toBe(true)
    // The tree that moved from four to three is still very much there.
    expect(targetMissing(thinned, { kind: 'tree', posKey: 'row_1:4' })).toBe(false)
  })

  it('never calls the farm or a crop missing', () => {
    const s = state()
    expect(targetMissing(s, { kind: 'farm' })).toBe(false)
    expect(targetMissing(s, { kind: 'species', species: 'fig' })).toBe(false)
  })
})
