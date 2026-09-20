import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import { defaultMonths, monthPhrase, proposeAll, proposeSeedTasks } from '@/engine/seedTasks'
import type { PlannerPlanting } from '@/engine/compare'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_s${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

const PLANTING = {
  id: 'pl_pawpaw',
  name: 'Pawpaws - Block 1',
  geometry: { rowLengthFt: 200, rowWidthFt: 16, inRowSpacingFt: 10, rows: 4 },
  yield: { maturePerPlant: 30, unit: 'lb', unitsPerHarvestHour: 60 },
  costItems: [
    { id: 'c_prune', label: 'Winter pruning', basis: 'perPlant', quantity: 0.25, isLabor: true },
    { id: 'c_mow', label: 'Mowing', basis: 'perAcre', quantity: 4, isLabor: true },
    { id: 'c_plastic', label: 'Plastic mulch', basis: 'perRowFoot', quantity: 0.5, isLabor: false },
  ],
  harvestItems: [
    { id: 'h_pick', label: 'Picking labor', basis: 'perYieldUnit', quantity: 1, isLabor: true },
  ],
  taskCalendar: [{ costItemId: 'c_prune', months: [1, 2] }],
} as unknown as PlannerPlanting

function state(extra: NewEvent[] = []) {
  const events: AnyEvent[] = []
  let ts = 1000
  const push = (e: NewEvent) => events.push(stamp(e, ts++))
  push({ type: 'farm.create', payload: { id: 'farm_1', name: 'F', center: [-77, 40], zoom: 17 } })
  push({
    type: 'block.create',
    payload: {
      id: 'blk_pp1',
      code: 'PP1',
      name: 'Pawpaws Block 1',
      species: 'pawpaw',
      numbering: { rowsFrom: 'N', positionsFrom: 'x' },
      planner: { plantingId: 'pl_pawpaw' },
    },
  })
  for (const e of extra) push(e)
  return materialize(events)
}

describe('seeding tasks from the plan', () => {
  it('says when a job falls', () => {
    expect(monthPhrase([1, 2])).toBe('January to February')
    expect(monthPhrase([6])).toBe('June')
    expect(monthPhrase([11, 1])).toBe('January, November')
    expect(monthPhrase([])).toBe('')
    expect(defaultMonths({ id: 'x', label: 'Summer pruning' })).toEqual([6, 7])
    expect(defaultMonths({ id: 'x', label: 'Mowing' })).toEqual([5, 6, 7, 8, 9])
    expect(defaultMonths({ id: 'x', label: 'Bookkeeping' })).toEqual([])
  })

  it('uses the plan’s own timing, falls back to the label, and skips what it should', () => {
    const drafts = proposeSeedTasks(state(), PLANTING, state().blocks.blk_pp1!)
    expect(drafts.map((d) => d.title)).toEqual([
      'Winter pruning, Pawpaws Block 1',
      'Mowing, Pawpaws Block 1',
    ])
    const prune = drafts[0]!
    // The calendar says January and February; 0.25 hours × 80 plants is 20 hours.
    expect(prune).toMatchObject({
      season: 'January to February',
      seasonMonths: [1, 2],
      category: 'pruning',
      estimatedMinutes: 1200,
    })
    expect(prune.targets).toEqual([{ kind: 'block', id: 'blk_pp1' }])
    expect(prune.notes).toMatch(/about 20\.0 hours for PP1/)
    // Mowing has no timing, so the label decides.
    expect(drafts[1]).toMatchObject({ seasonMonths: [5, 6, 7, 8, 9], category: 'mowing' })
    // Non-labor items and harvest labor are not tasks.
    expect(drafts.some((d) => d.title.includes('Plastic'))).toBe(false)
    expect(drafts.some((d) => d.title.includes('Picking'))).toBe(false)
  })

  it('skips a job already on a list, so running it twice is harmless', () => {
    const withTask = state([
      {
        type: 'task.create',
        payload: { id: 'tsk_1', title: 'Mowing, Pawpaws Block 1', bucket: 'later' },
      },
    ])
    const { drafts, skipped } = proposeAll(withTask, [PLANTING])
    expect(drafts.map((d) => d.title)).toEqual(['Winter pruning, Pawpaws Block 1'])
    expect(skipped).toBe(1)
  })

  it('ignores a planting no block is linked to', () => {
    const { drafts } = proposeAll(state(), [{ ...PLANTING, id: 'pl_other' }])
    expect(drafts).toEqual([])
  })
})
