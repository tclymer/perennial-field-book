import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import {
  backupAgeDays,
  compareAll,
  comparePlanting,
  denominators,
  guessCategory,
  loadedWage,
  overheadSummary,
  parseBackup,
  type PlannerPlanting,
} from '@/engine/compare'
import { applyChanges, changesFrom, fileNameFor } from '@/engine/writeback'
import { plannerBackup } from '@/engine/planner'
import type { Target } from '@/model/types'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_c${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

/**
 * A backup shaped like the planner's own: the Farm object flattened, schemaVersion 2, with
 * an unknown key at every level to prove the round trip keeps them.
 */
const BACKUP = {
  id: 'farm_planner_1',
  name: 'Threefold Farm',
  schemaVersion: 2,
  appVersion: '1.0.0',
  exportedAt: '2026-09-20T12:00:00.000Z',
  settings: { baseWage: 20, laborBurdenPct: 0.25, somethingElse: true },
  scenarios: [{ id: 'sc_1', name: 'Base' }],
  sharedAssets: [],
  customTemplates: [],
  plantings: [
    {
      id: 'pl_pawpaw',
      name: 'Pawpaws - Block 1',
      status: 'active',
      templateId: 'pawpaw-grafted',
      notes: 'from the extension tables',
      geometry: { rowLengthFt: 200, rowWidthFt: 16, inRowSpacingFt: 10, rows: 4 },
      life: { lifeYears: 40, yearsToMaturity: 8, cropLossYears: 1 },
      yield: { maturePerPlant: 30, unit: 'lb', unitsPerHarvestHour: 60, extra: 1 },
      plantCost: 25,
      costItems: [
        {
          id: 'c_mow',
          label: 'Mowing',
          block: 'annual',
          basis: 'perAcre',
          quantity: 4,
          unitCost: 0,
          unitCostRef: 'loadedWage',
          isLabor: true,
        },
        {
          id: 'c_prune',
          label: 'Winter pruning',
          block: 'annual',
          basis: 'perPlant',
          quantity: 0.1,
          unitCost: 0,
          unitCostRef: 'loadedWage',
          isLabor: true,
        },
        {
          id: 'c_plastic',
          label: 'Plastic mulch',
          block: 'annual',
          basis: 'perRowFoot',
          quantity: 0.5,
          unitCost: 0.2,
          isLabor: false,
        },
      ],
      harvestItems: [
        {
          id: 'h_pick',
          label: 'Picking and supervision labor',
          block: 'harvest',
          basis: 'perYieldUnit',
          quantity: 1,
          unitCost: 0,
          unitCostRef: 'harvestLaborPerUnit',
          isLabor: true,
        },
      ],
      revenueChannels: [],
      taskCalendar: [{ costItemId: 'c_prune', months: [1, 2] }],
    },
    {
      id: 'pl_fig',
      name: 'Figs',
      status: 'active',
      geometry: { rowLengthFt: 60, rowWidthFt: 10, inRowSpacingFt: 6, rows: 2 },
      life: { lifeYears: 20, yearsToMaturity: 4, cropLossYears: 0 },
      yield: { maturePerPlant: 10, unit: 'half pint', unitsPerHarvestHour: 20 },
      plantCost: 15,
      costItems: [],
      harvestItems: [],
      revenueChannels: [],
    },
  ],
}

/** PP1 linked to the pawpaw planting, with trees, harvest, and a season of logs. */
function farmState() {
  const events: AnyEvent[] = []
  let ts = 1000
  const push = (e: NewEvent) => events.push(stamp(e, ts++))
  push({
    type: 'farm.create',
    payload: { id: 'farm_1', name: 'Threefold', center: [-77, 40], zoom: 17 },
  })
  push({
    type: 'block.create',
    payload: {
      id: 'blk_pp1',
      code: 'PP1',
      name: 'Pawpaws Block 1',
      species: 'pawpaw',
      numbering: { rowsFrom: 'N', positionsFrom: 'x' },
      planner: {
        plantingId: 'pl_pawpaw',
        rowLengthFt: 200,
        rowWidthFt: 16,
        inRowSpacingFt: 10,
        rows: 4,
      },
    },
  })
  push({ type: 'person.create', payload: { id: 'per_1', name: 'Tim' } })
  push({
    type: 'variety.create',
    payload: { id: 'var_shen', species: 'pawpaw', name: 'Shenandoah' },
  })
  push({
    type: 'row.create',
    payload: {
      id: 'row_1',
      blockId: 'blk_pp1',
      number: 1,
      polyline: [
        [-77.083, 40.179],
        [-77.082, 40.179],
      ],
      layout: { by: 'count', count: 2 },
    },
  })
  push({
    type: 'tree.create',
    payload: { id: 'tree_1', posKey: 'row_1:1', varietyId: 'var_shen', plantedDate: '2019-05-01' },
  })
  push({
    type: 'tree.create',
    payload: { id: 'tree_2', posKey: 'row_1:2', varietyId: 'var_shen', plantedDate: '2020-05-01' },
  })
  // 600 lb harvested in 2026.
  for (let i = 0; i < 6; i++) {
    push({
      type: 'harvest.create',
      payload: {
        id: `hrv_${i}`,
        date: '2026-09-10',
        crop: 'pawpaw',
        varietyId: 'var_shen',
        blockId: 'blk_pp1',
        quantity: 100,
        unit: 'lb',
        box: i + 1,
      },
    })
  }
  const log = (id: string, date: string, minutes: number, category: string, targets: Target[]) =>
    push({
      type: 'log.create',
      payload: { id, date, personIds: ['per_1'], durationMinutes: minutes, category, targets },
    })
  // 20 hours of harvest, 11 hours of mowing, 3 hours of pruning, all on PP1 in 2026.
  log('log_h', '2026-09-10', 1200, 'harvest', [{ kind: 'block', id: 'blk_pp1' }])
  log('log_m1', '2026-06-01', 360, 'mowing', [{ kind: 'block', id: 'blk_pp1' }])
  log('log_m2', '2026-07-01', 300, 'mowing', [{ kind: 'block', id: 'blk_pp1' }])
  log('log_p', '2026-02-01', 180, 'pruning', [{ kind: 'block', id: 'blk_pp1' }])
  // Overhead and a previous year, neither of which should reach the 2026 comparison.
  log('log_barn', '2026-03-01', 240, 'construction', [])
  log('log_old', '2025-06-01', 600, 'mowing', [{ kind: 'block', id: 'blk_pp1' }])
  return { events, push }
}

const state = materialize(farmState().events)
const pawpaw = BACKUP.plantings[0] as unknown as PlannerPlanting

describe('reading a planner backup', () => {
  it('parses it, reads the wage, and dates it', () => {
    const { farm } = parseBackup(JSON.stringify(BACKUP))
    expect(farm.plantings).toHaveLength(2)
    expect(loadedWage(farm)).toBe(25)
    expect(backupAgeDays(farm, new Date('2026-09-22T12:00:00Z'))).toBe(2)
    expect(backupAgeDays({ plantings: [] })).toBeUndefined()
    expect(() => parseBackup('not json')).toThrow(/not JSON/)
    expect(() => parseBackup('{"nope":1}')).toThrow(/not a Perennial Profit Planner/)
  })

  it('reproduces the planner’s own denominators', () => {
    const d = denominators(pawpaw)
    // 200 / 10 = 20 plants per row, 4 rows, 200 × 16 × 4 / 43560 acres.
    expect(d.plantsPerRow).toBe(20)
    expect(d.plants).toBe(80)
    expect(d.rowFeet).toBe(800)
    expect(d.acres).toBeCloseTo(0.2938, 4)
    expect(d.matureYield).toBe(2400)
  })

  it('guesses which category feeds an item from its label', () => {
    expect(guessCategory('Winter pruning')).toBe('pruning')
    expect(guessCategory('Mowing')).toBe('mowing')
    expect(guessCategory('Picking and supervision labor')).toBe('harvest')
    expect(guessCategory('Ties and clips')).toBe('training')
    // A loose word rule would call this maintenance, because "something" contains "thin".
    expect(guessCategory('Something else entirely')).toBeUndefined()
  })
})

describe('comparing a planting with a season of records', () => {
  const comparison = comparePlanting(state, pawpaw, state.blocks.blk_pp1!, 2026)
  const row = (key: string) => comparison.rows.find((r) => r.key === key)

  it('proposes the planted year from the earliest tree', () => {
    expect(row('plantedYear')).toMatchObject({ planner: undefined, measured: 2019, unit: 'year' })
  })

  it('computes yield realization the way the planner computes expected yield', () => {
    // 600 lb against 30 × 20 × 4 = 2,400 lb at maturity.
    expect(row('yield:2026')).toMatchObject({ measured: 0.25, planner: undefined })
    expect(row('yield:2026')?.evidence).toMatchObject({ logs: 6, quantity: 600 })
  })

  it('measures units picked per hour against the estimate', () => {
    // 600 lb in 20 hours.
    expect(row('unitsPerHarvestHour')).toMatchObject({ planner: 60, measured: 30, unit: 'lb/h' })
  })

  it('turns logged hours into each item’s own rate', () => {
    // 11 hours of mowing over 0.2938 acres.
    const mow = row('item:c_mow')!
    expect(mow.planner).toBe(4)
    expect(mow.measured).toBeCloseTo(37.44, 1)
    expect(mow.unit).toBe('h/acre')
    expect(mow.evidence).toMatchObject({ logs: 2, from: '2026-06-01', to: '2026-07-01' })
    // 3 hours of pruning over 80 plants.
    expect(row('item:c_prune')).toMatchObject({ planner: 0.1, measured: 0.038, unit: 'h/plant' })
    // A non-labor item is never proposed, and harvest labor goes through units per hour.
    expect(row('item:c_plastic')).toBeUndefined()
    expect(row('item:h_pick')).toBeUndefined()
  })

  it('marks every row with how completely its category is tracked', () => {
    expect(row('item:c_mow')?.coverage).toBe('partial')
    const marked = materialize([
      ...farmState().events,
      stamp(
        { type: 'farm.patch', payload: { coverage: { mowing: 'complete', pruning: 'untracked' } } },
        99_000,
      ),
    ])
    const c = comparePlanting(marked, pawpaw, marked.blocks.blk_pp1!, 2026)
    expect(c.rows.find((r) => r.key === 'item:c_mow')?.coverage).toBe('complete')
    const pruning = c.rows.find((r) => r.key === 'item:c_prune')!
    expect(pruning.coverage).toBe('untracked')
    expect(pruning.blocked).toMatch(/not tracked/)
  })

  it('refuses to compare across different units', () => {
    const fig = BACKUP.plantings[1] as unknown as PlannerPlanting
    const c = comparePlanting(
      state,
      { ...fig, yield: { ...fig.yield, unit: 'quart' } },
      state.blocks.blk_pp1!,
      2026,
    )
    expect(c.unitMismatch).toEqual({ planner: 'quart', farm: 'lb' })
    expect(c.rows.find((r) => r.key === 'yield:2026')?.blocked).toMatch(/expects quart/)
  })

  it('lists what is linked, unlinked, and unmatched, and totals overhead', () => {
    const { farm } = parseBackup(JSON.stringify(BACKUP))
    const all = compareAll(state, farm, 2026)
    expect(all.comparisons.map((c) => c.block.code)).toEqual(['PP1'])
    expect(all.unmatchedPlantings.map((p) => p.name)).toEqual(['Figs'])
    expect(all.unlinkedBlocks).toHaveLength(0)
    const oh = overheadSummary(state, farm, 2026)
    expect(oh.hours).toBe(4)
    expect(oh.cost).toBe(100)
    expect(oh.byCategory).toEqual([{ category: 'construction', hours: 4 }])
  })
})

describe('writing the corrections back', () => {
  const comparison = comparePlanting(state, pawpaw, state.blocks.blk_pp1!, 2026)
  const chosen = new Set([
    'pl_pawpaw:plantedYear',
    'pl_pawpaw:yield:2026',
    'pl_pawpaw:unitsPerHarvestHour',
    'pl_pawpaw:item:c_mow',
  ])
  const changes = changesFrom('pl_pawpaw', comparison.rows, chosen)
  const out = applyChanges(BACKUP, changes, new Date('2026-09-20T12:00:00Z'))
  const after = JSON.parse(out.json)

  it('applies only what was ticked', () => {
    expect(out.applied).toBe(4)
    expect(out.skipped).toEqual([])
    const p = after.plantings[0]
    expect(p.plantedYear).toBe(2019)
    expect(p.actuals).toEqual([
      {
        year: 2026,
        yieldRealization: 0.25,
        note: expect.stringContaining('600 lb harvested in 2026'),
      },
    ])
    expect(p.yield.unitsPerHarvestHour).toBe(30)
    const mow = p.costItems.find((i: { id: string }) => i.id === 'c_mow')
    expect(mow.quantity).toBeCloseTo(37.44, 1)
    expect(mow.notes).toMatch(/Was 4\./)
    // Untouched: pruning was not ticked.
    expect(p.costItems.find((i: { id: string }) => i.id === 'c_prune').quantity).toBe(0.1)
  })

  it('keeps every other key exactly as it was', () => {
    expect(after.id).toBe(BACKUP.id)
    expect(after.schemaVersion).toBe(2)
    expect(after.appVersion).toBe('1.0.0')
    expect(after.settings).toEqual(BACKUP.settings)
    expect(after.scenarios).toEqual(BACKUP.scenarios)
    expect(after.plantings[1]).toEqual(BACKUP.plantings[1])
    expect(after.plantings[0].yield.extra).toBe(1)
    expect(after.plantings[0].taskCalendar).toEqual(BACKUP.plantings[0].taskCalendar)
    expect(after.plantings[0].life).toEqual(BACKUP.plantings[0].life)
    // The original object was not mutated.
    expect((BACKUP.plantings[0] as { plantedYear?: number }).plantedYear).toBeUndefined()
  })

  it('still reads as a planner backup afterwards', () => {
    expect(plannerBackup.safeParse(after).success).toBe(true)
    expect(parseBackup(out.json).farm.plantings).toHaveLength(2)
  })

  it('replaces an actual for a year that already has one', () => {
    const withActual = structuredClone(BACKUP) as typeof BACKUP & {
      plantings: { actuals?: { year: number; yieldRealization: number; note?: string }[] }[]
    }
    withActual.plantings[0]!.actuals = [
      { year: 2025, yieldRealization: 0.1 },
      { year: 2026, yieldRealization: 0.9, note: 'guessed' },
    ]
    const again = applyChanges(withActual, changes, new Date('2026-09-20T12:00:00Z'))
    const actuals = JSON.parse(again.json).plantings[0].actuals
    expect(actuals).toHaveLength(2)
    expect(actuals[1]).toMatchObject({ year: 2026, yieldRealization: 0.25 })
    expect(actuals[1].note).toMatch(/^guessed\n/)
  })

  it('reports a change it cannot place', () => {
    const gone = applyChanges({ plantings: [] }, changes)
    expect(gone.applied).toBe(0)
    expect(gone.skipped).toHaveLength(4)
    expect(gone.skipped[0]!.reason).toMatch(/no longer in the file/)
  })

  it('names the file next to the planner’s own convention', () => {
    expect(fileNameFor('Threefold Farm', new Date('2026-09-20T12:00:00Z'))).toBe(
      'threefold-farm-2026-09-20-trued-up.json',
    )
  })
})
