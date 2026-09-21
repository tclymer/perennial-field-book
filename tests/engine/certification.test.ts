import { describe, expect, it } from 'vitest'
import {
  applications,
  applicationsToCsv,
  harvestsInRange,
  logsInCategories,
  plantingStock,
  plantingStockToCsv,
  summarize,
  yearRange,
} from '@/engine/certification'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'

const ev = (type: string, payload: unknown): NewEvent => ({ type, payload }) as NewEvent

function state(extra: NewEvent[] = []) {
  const base: NewEvent[] = [
    ev('farm.create', { id: 'farm_1', name: 'Threefold', center: [-77.083, 40.1794], zoom: 17 }),
    ev('block.create', {
      id: 'blk',
      code: 'PP1',
      name: 'Pawpaws',
      numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
    }),
    ev('row.create', {
      id: 'row_1',
      blockId: 'blk',
      number: 1,
      polyline: [
        [-77.0832, 40.17935],
        [-77.0828, 40.17935],
      ],
      layout: { by: 'count', count: 3 },
    }),
    ev('person.create', { id: 'per_1', name: 'Tim' }),
    ev('variety.create', {
      id: 'var_shen',
      species: 'pawpaw',
      name: 'Shenandoah',
      source: 'Peterson Pawpaws',
    }),
    ev('variety.create', { id: 'var_mystery', species: 'pawpaw', name: 'Unknown seedling' }),
    ev('tree.create', {
      id: 'tree_1',
      posKey: 'row_1:1',
      varietyId: 'var_shen',
      status: 'alive',
      plantedDate: '2019-05-01',
    }),
    ev('tree.create', {
      id: 'tree_2',
      posKey: 'row_1:2',
      varietyId: 'var_shen',
      status: 'alive',
      plantedDate: '2021-04-20',
    }),
    ev('tree.create', {
      id: 'tree_3',
      posKey: 'row_1:3',
      varietyId: 'var_mystery',
      status: 'alive',
    }),
  ]
  return materialize(
    [...base, ...extra].map((e, i) => ({
      id: `evt_${i}`,
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000 + i,
      ...e,
    })) as AnyEvent[],
  )
}

const SPRAY = ev('log.create', {
  id: 'log_spray',
  date: '2026-05-14',
  personIds: ['per_1'],
  durationMinutes: 90,
  category: 'spraying',
  targets: [{ kind: 'block', id: 'blk' }],
  materials: [
    { product: 'Surround WP', rate: '25 lb/acre', amount: 12, unit: 'lb', lot: 'A-7741' },
    { product: 'Neem oil', rate: '1%', amount: 2, unit: 'gal' },
  ],
  notes: 'Ahead of the rain.',
})

describe('the input application record', () => {
  it('gives one row per product, not per log', () => {
    const rows = applications(state([SPRAY]), yearRange(2026))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.product)).toEqual(['Surround WP', 'Neem oil'])
    // Every row carries the same where, who and when, because an inspector reads down a column.
    for (const r of rows) {
      expect(r.date).toBe('2026-05-14')
      expect(r.where).toBe('PP1 Pawpaws')
      expect(r.people).toBe('Tim')
      expect(r.category).toBe('Spraying')
    }
    expect(rows[0]!.lot).toBe('A-7741')
  })

  it('leaves out logs with no materials, and logs outside the range', () => {
    const s = state([
      SPRAY,
      ev('log.create', {
        id: 'log_mow',
        date: '2026-05-15',
        personIds: ['per_1'],
        durationMinutes: 60,
        category: 'mowing',
        targets: [{ kind: 'farm' }],
      }),
      ev('log.create', {
        id: 'log_old',
        date: '2025-05-14',
        personIds: ['per_1'],
        category: 'spraying',
        targets: [{ kind: 'farm' }],
        materials: [{ product: 'Last year' }],
      }),
    ])
    expect(applications(s, yearRange(2026)).map((a) => a.product)).toEqual([
      'Surround WP',
      'Neem oil',
    ])
    expect(applications(s, yearRange(2025)).map((a) => a.product)).toEqual(['Last year'])
  })

  it('says where a log pointed at nothing rather than leaving it blank', () => {
    const s = state([
      ev('log.create', {
        id: 'log_x',
        date: '2026-06-01',
        personIds: [],
        category: 'spraying',
        targets: [],
        materials: [{ product: 'Sulphur' }],
      }),
    ])
    expect(applications(s, yearRange(2026))[0]!.where).toBe('not recorded')
  })

  it('writes a CSV with a header and one line per application', () => {
    const csv = applicationsToCsv(applications(state([SPRAY]), yearRange(2026)))
    const lines = csv.split('\n')
    expect(lines[0]).toContain('product')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Surround WP')
    expect(lines[1]).toContain('A-7741')
  })
})

describe('the planting stock record', () => {
  it('counts trees per variety with where they came from and when they went in', () => {
    const rows = plantingStock(state())
    expect(rows.map((r) => r.variety)).toEqual(['Shenandoah', 'Unknown seedling'])
    const shen = rows[0]!
    expect(shen.source).toBe('Peterson Pawpaws')
    expect(shen.trees).toBe(2)
    expect(shen.blocks).toBe('PP1')
    expect(shen.firstPlanted).toBe('2019-05-01')
    expect(shen.lastPlanted).toBe('2021-04-20')
  })

  it('marks a variety with no source rather than leaving it empty', () => {
    expect(plantingStock(state())[1]!.source).toBe('not recorded')
  })

  it('leaves out a variety that no longer stands anywhere', () => {
    const s = state([
      ev('tree.event', { id: 'tev', treeId: 'tree_3', kind: 'removed', date: '2026-03-01' }),
    ])
    expect(plantingStock(s).map((r) => r.variety)).toEqual(['Shenandoah'])
  })

  it('writes a CSV', () => {
    const csv = plantingStockToCsv(plantingStock(state()))
    expect(csv.split('\n')[0]).toContain('source')
    expect(csv).toContain('Peterson Pawpaws')
  })
})

describe('the rest of the packet', () => {
  it('pulls logs in the categories a certifier asks about', () => {
    const s = state([
      ev('log.create', {
        id: 'log_clean',
        date: '2026-04-02',
        personIds: ['per_1'],
        category: 'maintenance',
        targets: [{ kind: 'farm' }],
        notes: 'Sprayer rinsed and logged.',
      }),
      SPRAY,
    ])
    const rows = logsInCategories(s, yearRange(2026), ['maintenance'])
    expect(rows.map((l) => l.id)).toEqual(['log_clean'])
  })

  it('totals the season for the front of the packet', () => {
    const s = state([
      SPRAY,
      ev('harvest.create', {
        id: 'h1',
        date: '2026-09-19',
        crop: 'pawpaw',
        quantity: 10.2,
        unit: 'lb',
        blockId: 'blk',
      }),
      ev('harvest.create', {
        id: 'h2',
        date: '2026-09-20',
        crop: 'pawpaw',
        quantity: 8,
        unit: 'lb',
        blockId: 'blk',
      }),
    ])
    const sum = summarize(s, yearRange(2026))
    expect(sum.applications).toBe(2)
    expect(sum.products).toEqual(['Neem oil', 'Surround WP'])
    expect(sum.harvestEntries).toBe(2)
    expect(sum.harvestByCrop).toEqual([{ crop: 'pawpaw', quantity: 18.2, unit: 'lb' }])
    expect(sum.hours).toBe(1.5)
    // The gaps a certifier would ask about, surfaced before they do.
    expect(sum.varietiesWithoutSource).toEqual(['Unknown seedling'])
    expect(sum.treesWithoutPlantedDate).toBe(1)
  })

  it('keeps different units apart in the harvest total', () => {
    const s = state([
      ev('harvest.create', {
        id: 'h1',
        date: '2026-09-19',
        crop: 'fig',
        quantity: 6,
        unit: 'half pint',
      }),
      ev('harvest.create', {
        id: 'h2',
        date: '2026-09-19',
        crop: 'pawpaw',
        quantity: 10,
        unit: 'lb',
      }),
    ])
    expect(summarize(s, yearRange(2026)).harvestByCrop).toEqual([
      { crop: 'pawpaw', quantity: 10, unit: 'lb' },
      { crop: 'fig', quantity: 6, unit: 'half pint' },
    ])
  })

  it('cuts the harvest to the range asked for', () => {
    const s = state([
      ev('harvest.create', {
        id: 'h1',
        date: '2025-09-19',
        crop: 'pawpaw',
        quantity: 5,
        unit: 'lb',
      }),
      ev('harvest.create', {
        id: 'h2',
        date: '2026-09-19',
        crop: 'pawpaw',
        quantity: 7,
        unit: 'lb',
      }),
    ])
    expect(harvestsInRange(s, yearRange(2026)).map((h) => h.id)).toEqual(['h2'])
  })
})
