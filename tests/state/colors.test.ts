import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import {
  BLOCK_PALETTE,
  GREY,
  blockVarietyColors,
  shade,
  speciesColors,
  varietyColorsBySpecies,
} from '@/state/colors'
import { positionsFC } from '@/map/geojson'
import { seedEvents } from '../ui/fixtures'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_c${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

/** The seed farm plus a persimmon block with fourteen varieties in three types. */
function farm() {
  const events: AnyEvent[] = [...seedEvents('farm_1')]
  let ts = 5000
  events.push(
    stamp(
      {
        type: 'block.create',
        payload: {
          id: 'blk_per',
          code: 'PER',
          name: 'Persimmons',
          species: 'persimmon',
          numbering: { rowsFrom: 'N', positionsFrom: 'x' },
        },
      },
      ts++,
    ),
    stamp(
      {
        type: 'row.create',
        payload: {
          id: 'row_per',
          blockId: 'blk_per',
          number: 1,
          polyline: [
            [-77.082, 40.18],
            [-77.081, 40.18],
          ],
          layout: { by: 'count', count: 15 },
        },
      },
      ts++,
    ),
  )
  const types = ['Asian', 'American', 'Hybrid']
  for (let i = 0; i < 14; i++) {
    events.push(
      stamp(
        {
          type: 'variety.create',
          payload: {
            id: `var_p${i}`,
            species: 'persimmon',
            name: `P${String(i).padStart(2, '0')}`,
            group: types[i % 3],
          },
        },
        ts++,
      ),
      stamp(
        {
          type: 'tree.create',
          payload: { id: `tree_p${i}`, posKey: `row_per:${i + 1}`, varietyId: `var_p${i}` },
        },
        ts++,
      ),
    )
  }
  // One more tree of P00 so it ranks first in the block.
  events.push(
    stamp(
      {
        type: 'tree.create',
        payload: { id: 'tree_extra', posKey: 'row_per:15', varietyId: 'var_p0' },
      },
      ts++,
    ),
  )
  return materialize(events)
}

describe('colors', () => {
  const state = farm()

  it('gives each species one hue and shades the types within it', () => {
    const species = speciesColors(state)
    expect(species.size).toBe(2)
    expect(species.get('pawpaw')).not.toBe(species.get('persimmon'))
    const colors = varietyColorsBySpecies(state)
    const asian = colors.get('var_p0')
    const american = colors.get('var_p1')
    const hybrid = colors.get('var_p2')
    expect(asian).not.toBe(american)
    expect(american).not.toBe(hybrid)
    // Same type, same shade.
    expect(colors.get('var_p3')).toBe(asian)
    expect(shade('#f97316', 0)).toBe('#f97316')
    expect(shade('#f97316', 20)).not.toBe('#f97316')
  })

  it('hands out distinct colors per block, most planted first, grey past the palette', () => {
    const per = blockVarietyColors(state).get('blk_per')!
    expect(per.get('var_p0')).toBe(BLOCK_PALETTE[0])
    const used = new Set([...per.values()].filter((c) => c !== GREY))
    expect(used.size).toBe(BLOCK_PALETTE.length)
    expect([...per.values()].filter((c) => c === GREY)).toHaveLength(14 - BLOCK_PALETTE.length)
    // A different block starts the palette again.
    const pp1 = blockVarietyColors(state).get('blk_pp1')!
    expect([...pp1.values()][0]).toBe(BLOCK_PALETTE[0])
  })

  it('highlighting keeps the chosen varieties colored and greys the rest', () => {
    const fc = positionsFC(state, { colorBy: 'species', highlight: new Set(['var_p1']) })
    const colorsByVariety = new Map<string | null, Set<string>>()
    for (const f of fc.features) {
      const key = String(f.properties?.variety ?? null)
      colorsByVariety.set(
        key,
        new Set([...(colorsByVariety.get(key) ?? []), String(f.properties?.color)]),
      )
    }
    const lit = [...colorsByVariety.get('P01')!]
    expect(lit).toEqual([varietyColorsBySpecies(state).get('var_p1')])
    const others = [...colorsByVariety.entries()]
      .filter(([k]) => k !== 'P01')
      .flatMap(([, v]) => [...v])
    expect(new Set(others).size).toBe(1)
  })
})
