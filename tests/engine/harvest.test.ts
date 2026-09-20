import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import {
  allVarietiesOf,
  boxLabel,
  cropsOf,
  harvestsToCsv,
  placesFor,
  recentChoices,
  sessionOf,
  sessions,
  shortDate,
  treeShares,
  treeYieldByYear,
  varietiesIn,
  yieldBy,
} from '@/engine/harvest'
import { isCountUnit, unitFor } from '@/model/harvest'
import { seedEvents } from '../ui/fixtures'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_h${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

/**
 * The seed farm (PP1 with rows 1 and 2, Shenandoah on row 1, a gray house greenhouse)
 * plus: row 1 positions 1–3 are Shenandoah trees (position 3 dead), a fig variety with two
 * loose trees inside the gray house, and a season of harvests.
 */
function farm() {
  const events: AnyEvent[] = [...seedEvents('farm_1')]
  // Above the fixture timestamps, so patches land after the things they patch.
  let ts = 1_700_000_100_000
  const push = (e: NewEvent) => events.push(stamp(e, ts++))
  push({
    type: 'tree.create',
    payload: { id: 'tree_s1', posKey: 'row_1:1', varietyId: 'var_shen' },
  })
  push({
    type: 'tree.create',
    payload: { id: 'tree_s2', posKey: 'row_1:2', varietyId: 'var_shen' },
  })
  push({
    type: 'tree.create',
    payload: { id: 'tree_s3', posKey: 'row_1:3', varietyId: 'var_shen', status: 'dead' },
  })
  push({
    type: 'variety.create',
    payload: { id: 'var_fig', species: 'fig', name: 'Chicago Hardy' },
  })
  push({
    type: 'feature.patch',
    payload: {
      id: 'ftr_blue',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [-77.083, 40.1798],
          [-77.0827, 40.1798],
          [-77.0827, 40.18],
          [-77.083, 40.18],
        ],
      },
    },
  })
  push({
    type: 'block.create',
    payload: {
      id: 'blk_gh',
      code: 'GH',
      name: 'Greenhouse trees',
      numbering: { rowsFrom: 'N', positionsFrom: 'door' },
    },
  })
  const events2: NewEvent[] = [
    {
      type: 'position.create',
      payload: { id: 'pos_f1', blockId: 'blk_gh', number: 1, coord: [-77.0829, 40.1799] },
    },
    {
      type: 'position.create',
      payload: { id: 'pos_f2', blockId: 'blk_gh', number: 2, coord: [-77.0828, 40.1799] },
    },
    { type: 'tree.create', payload: { id: 'tree_f1', posKey: 'pos_f1', varietyId: 'var_fig' } },
    { type: 'tree.create', payload: { id: 'tree_f2', posKey: 'pos_f2', varietyId: 'var_fig' } },
    {
      type: 'harvest.create',
      payload: {
        id: 'h1',
        date: '2026-09-10',
        crop: 'pawpaw',
        varietyId: 'var_shen',
        blockId: 'blk_pp1',
        quantity: 11.5,
        unit: 'lb',
        box: 1,
      },
    },
    {
      type: 'harvest.create',
      payload: {
        id: 'h2',
        date: '2026-09-10',
        crop: 'pawpaw',
        varietyId: 'var_shen',
        blockId: 'blk_pp1',
        quantity: 8.5,
        unit: 'lb',
        box: 2,
      },
    },
    {
      type: 'harvest.create',
      payload: { id: 'h3', date: '2026-09-10', crop: 'pawpaw', quantity: 4, unit: 'lb', box: 3 },
    },
    {
      type: 'harvest.create',
      payload: {
        id: 'h4',
        date: '2026-09-12',
        crop: 'pawpaw',
        posKey: 'row_1:1',
        quantity: 2,
        unit: 'lb',
        box: 1,
      },
    },
    {
      type: 'harvest.create',
      payload: {
        id: 'h5',
        date: '2026-09-12',
        crop: 'fig',
        featureId: 'ftr_blue',
        quantity: 30,
        unit: 'half pint',
        box: 1,
      },
    },
    {
      type: 'harvest.create',
      payload: {
        id: 'h6',
        date: '2025-09-20',
        crop: 'pawpaw',
        varietyId: 'var_shen',
        quantity: 6,
        unit: 'lb',
        box: 1,
      },
    },
  ]
  for (const e of events2) push(e)
  return materialize(events)
}

describe('harvest', () => {
  const state = farm()

  it('knows the crops, units, and places', () => {
    expect(cropsOf(state)).toEqual(['pawpaw', 'fig'])
    expect(unitFor(state.farm, 'pawpaw')).toBe('lb')
    expect(unitFor(state.farm, 'Figs')).toBe('half pint')
    expect(unitFor({ ...state.farm!, units: { fig: 'pint' } }, 'fig')).toBe('pint')
    expect(isCountUnit('half pint')).toBe(true)
    // Pawpaws are in a block; the greenhouse is not offered for them.
    expect(placesFor(state, 'pawpaw').map((p) => p.label)).toEqual(['PP1 Pawpaws Block 1'])
    // Figs stand inside the Blue House, but they have a block, so only the block is offered.
    // Two chips for one picking meant one of them filed the weight where no report looks.
    const figPlaces = placesFor(state, 'fig')
    expect(figPlaces.map((p) => p.label)).toEqual(['GH Greenhouse trees'])
    expect(figPlaces.some((p) => p.id === 'blk_pp1')).toBe(false)
    // A crop with no block anywhere still needs somewhere to put a number.
    expect(placesFor(state, 'quince').map((p) => p.label)).toEqual(['Blue House'])
  })

  it('narrows varieties to the ones standing in a place', () => {
    const blocks = placesFor(state, 'pawpaw')
    expect(varietiesIn(state, 'pawpaw', blocks[0]!).map((v) => v.name)).toEqual(['Shenandoah'])
    // The greenhouse holds figs, not pawpaws. It is only offered for a crop with no block,
    // so name it here rather than looking for it among the fig places.
    const house = { kind: 'feature', id: 'ftr_blue', label: 'Blue House' } as const
    expect(varietiesIn(state, 'fig', house).map((v) => v.name)).toEqual(['Chicago Hardy'])
    expect(varietiesIn(state, 'pawpaw', house)).toEqual([])
    // With no place, every variety of the crop that stands somewhere.
    expect(varietiesIn(state, 'pawpaw', null).map((v) => v.name)).toEqual(['Shenandoah'])
    // The search is not limited to a place, so a variety with no trees is still findable.
    expect(allVarietiesOf(state, 'fig').map((v) => v.name)).toEqual(['Chicago Hardy'])
  })

  it('builds the tally sheet for a session with box numbers', () => {
    const s = sessionOf(state, '2026-09-10', 'pawpaw')
    expect(s.entries.map((e) => e.box)).toEqual([1, 2, 3])
    expect(s.tally).toEqual([
      { varietyId: 'var_shen', label: 'Shenandoah', boxes: 2, quantity: 20, unit: 'lb' },
      { varietyId: null, label: 'Mixed', boxes: 1, quantity: 4, unit: 'lb' },
    ])
    expect(s.totals).toEqual([{ unit: 'lb', quantity: 24, boxes: 3 }])
    expect(s.nextBox).toBe(4)
    expect(sessionOf(state, '2026-09-11', 'pawpaw').nextBox).toBe(1)
    expect(sessions(state).map((x) => `${x.date} ${x.crop}`)).toEqual([
      '2026-09-12 fig',
      '2026-09-12 pawpaw',
      '2026-09-10 pawpaw',
      '2025-09-20 pawpaw',
    ])
  })

  it('groups yields without mixing units', () => {
    const all = Object.values(state.harvests)
    // Pounds come first (32 in all against 30 half pints) and the two units never interleave.
    expect(yieldBy(state, all, 'year').map((r) => [r.label, r.quantity, r.unit])).toEqual([
      ['2026', 26, 'lb'],
      ['2025', 6, 'lb'],
      ['2026', 30, 'half pint'],
    ])
    expect(yieldBy(state, all, 'variety').map((r) => [r.label, r.quantity, r.unit])).toEqual([
      ['Shenandoah', 26, 'lb'],
      ['Mixed', 6, 'lb'],
      ['Mixed', 30, 'half pint'],
    ])
    expect(yieldBy(state, all, 'place').map((r) => [r.label, r.quantity])).toEqual([
      ['PP1 Pawpaws Block 1', 20],
      ['Anywhere', 12],
      ['Blue House', 30],
    ])
  })

  it('derives per-tree shares across living trees only, and direct entries to their tree', () => {
    const shares = treeShares(state, 2026)
    // 20 lb of Shenandoah in PP1 splits across the two living Shenandoahs, not the dead one.
    expect(shares.get('row_1:1')?.quantity).toBe(12)
    expect(shares.get('row_1:2')?.quantity).toBe(10)
    expect(shares.has('row_1:3')).toBe(false)
    expect(shares.get('row_1:1')?.direct).toBe(2)
    // The mixed box and the figs with no variety are counted nowhere.
    expect(shares.has('pos_f1')).toBe(false)
    const years = treeYieldByYear(state, 'row_1:1')
    expect(years.map((y) => [y.year, y.quantity, y.sharedAmong])).toEqual([
      ['2026', 12, [2]],
      ['2025', 3, [2]],
    ])
  })

  it('writes the line that goes on the box', () => {
    expect(boxLabel(state, state.harvests.h1!)).toBe('PP1 · Shenandoah · 11.5 lb · 9/10/26')
    // A box with no variety, picked in the greenhouse.
    expect(boxLabel(state, state.harvests.h5!)).toBe('Blue House · Mixed · 30 half pint · 9/12/26')
    // A box from one tree names the tree.
    expect(boxLabel(state, state.harvests.h4!)).toBe('PP1-1-1 · Mixed · 2 lb · 9/12/26')
    // Picked anywhere: no place on the label.
    expect(boxLabel(state, state.harvests.h6!)).toBe('Shenandoah · 6 lb · 9/20/25')
    expect(shortDate('2026-01-05')).toBe('1/5/26')
  })

  it('remembers recent choices and writes CSV', () => {
    expect(recentChoices(state, 'pawpaw')).toEqual({ varieties: ['var_shen'], places: ['blk_pp1'] })
    const csv = harvestsToCsv(state, Object.values(state.harvests))
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,crop,box,variety,place,tree,quantity,unit,people,notes')
    expect(lines[1]).toBe('2025-09-20,pawpaw,1,Shenandoah,,,6,lb,,')
    expect(lines[5]).toBe('2026-09-12,pawpaw,1,,,PP1-1-1,2,lb,,')
    expect(lines[6]).toBe('2026-09-12,fig,1,,Blue House,,30,half pint,,')
  })
})
