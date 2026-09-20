import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import {
  allocateHours,
  allocateLog,
  blockAreas,
  evidenceFor,
  totalOverhead,
} from '@/engine/allocate'
import type { Target, WorkLog } from '@/model/types'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_a${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

/**
 * Two pawpaw blocks of known planner geometry, 4,000 and 1,000 square feet, plus a
 * persimmon block and a barn. Areas come from the planner link, so they are exact.
 */
function farm() {
  const events: AnyEvent[] = []
  let ts = 1000
  const push = (e: NewEvent) => events.push(stamp(e, ts++))
  push({ type: 'farm.create', payload: { id: 'farm_1', name: 'F', center: [-77, 40], zoom: 17 } })
  const block = (id: string, code: string, species: string, rows: number) =>
    push({
      type: 'block.create',
      payload: {
        id,
        code,
        name: code,
        species,
        numbering: { rowsFrom: 'N', positionsFrom: 'x' },
        planner: { plantingId: `pl_${id}`, rowLengthFt: 100, rowWidthFt: 10, rows },
      },
    })
  block('blk_pp1', 'PP1', 'pawpaw', 4)
  block('blk_pp2', 'PP2', 'pawpaw', 1)
  block('blk_per', 'PER', 'persimmon', 5)
  push({
    type: 'feature.create',
    payload: {
      id: 'ftr_barn',
      name: 'Barn',
      kind: 'building',
      geometry: { type: 'Point', coordinates: [-77.08, 40.18] },
    },
  })
  push({ type: 'person.create', payload: { id: 'per_1', name: 'Tim' } })
  return { events, push, ts: () => ts }
}

function withLogs(
  logs: {
    id: string
    date: string
    minutes: number
    people?: number
    category?: string
    targets: Target[]
  }[],
) {
  const f = farm()
  for (const l of logs) {
    f.push({
      type: 'log.create',
      payload: {
        id: l.id,
        date: l.date,
        personIds: Array.from({ length: l.people ?? 1 }, (_, i) =>
          i === 0 ? 'per_1' : `per_${i + 1}`,
        ),
        durationMinutes: l.minutes,
        targets: l.targets,
        ...(l.category ? { category: l.category } : {}),
      },
    })
  }
  return materialize(f.events)
}

describe('allocating logged hours', () => {
  it('reads block areas from the planner geometry', () => {
    const areas = blockAreas(withLogs([]))
    expect(areas.get('blk_pp1')).toBe(4000)
    expect(areas.get('blk_pp2')).toBe(1000)
    expect(areas.get('blk_per')).toBe(5000)
  })

  it('sends a named block, row, or tree to that block', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 60,
        category: 'mowing',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
    ])
    const a = allocateHours(state)
    expect(a.byBlock.get('blk_pp1')?.get('mowing')).toBe(1)
    expect(totalOverhead(a)).toBe(0)
  })

  it('counts hours as duration times people', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 120,
        people: 2,
        category: 'pruning',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
    ])
    expect(allocateHours(state).byBlock.get('blk_pp1')?.get('pruning')).toBe(4)
  })

  it('splits a crop across that crop’s blocks by area', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 300,
        category: 'mowing',
        targets: [{ kind: 'species', species: 'pawpaw' }],
      },
    ])
    const a = allocateHours(state)
    // Five hours over 5,000 square feet of pawpaws: four fifths to PP1.
    expect(a.byBlock.get('blk_pp1')?.get('mowing')).toBe(4)
    expect(a.byBlock.get('blk_pp2')?.get('mowing')).toBe(1)
    expect(a.byBlock.has('blk_per')).toBe(false)
  })

  it('splits the whole farm across every block by area', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 600,
        category: 'mowing',
        targets: [{ kind: 'farm' }],
      },
    ])
    const a = allocateHours(state)
    // Ten hours over 10,000 square feet.
    expect(a.byBlock.get('blk_pp1')?.get('mowing')).toBe(4)
    expect(a.byBlock.get('blk_pp2')?.get('mowing')).toBe(1)
    expect(a.byBlock.get('blk_per')?.get('mowing')).toBe(5)
  })

  it('sends a building or nothing at all to overhead', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 60,
        category: 'construction',
        targets: [{ kind: 'feature', id: 'ftr_barn' }],
      },
      { id: 'log_2', date: '2026-06-02', minutes: 120, category: 'admin', targets: [] },
    ])
    const a = allocateHours(state)
    expect(a.byBlock.size).toBe(0)
    expect(a.overhead.get('construction')).toBe(1)
    expect(a.overhead.get('admin')).toBe(2)
    expect(totalOverhead(a)).toBe(3)
  })

  it('prefers a named place over a crop or the farm on the same log', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-06-01',
        minutes: 60,
        category: 'weeding',
        targets: [
          { kind: 'block', id: 'blk_pp2' },
          { kind: 'species', species: 'pawpaw' },
          { kind: 'farm' },
        ],
      },
    ])
    expect(allocateHours(state).byBlock.get('blk_pp2')?.get('weeding')).toBe(1)
  })

  it('ignores logs with no duration and honours a date range', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2025-06-01',
        minutes: 60,
        category: 'mowing',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
      {
        id: 'log_2',
        date: '2026-06-01',
        minutes: 60,
        category: 'mowing',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
      {
        id: 'log_3',
        date: '2026-06-02',
        minutes: 0,
        category: 'mowing',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
    ])
    const year = allocateHours(state, { from: '2026-01-01', to: '2026-12-31' })
    expect(year.byBlock.get('blk_pp1')?.get('mowing')).toBe(1)
    expect(year.logs).toHaveLength(1)
    expect(allocateHours(state).byBlock.get('blk_pp1')?.get('mowing')).toBe(2)
  })

  it('reports the evidence behind one block and category', () => {
    const state = withLogs([
      {
        id: 'log_1',
        date: '2026-05-01',
        minutes: 90,
        category: 'mowing',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
      {
        id: 'log_2',
        date: '2026-07-04',
        minutes: 300,
        category: 'mowing',
        targets: [{ kind: 'species', species: 'pawpaw' }],
      },
      {
        id: 'log_3',
        date: '2026-07-05',
        minutes: 60,
        category: 'pruning',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
      },
    ])
    expect(evidenceFor(state, 'blk_pp1', 'mowing')).toEqual({
      logs: 2,
      hours: 5.5,
      from: '2026-05-01',
      to: '2026-07-04',
    })
    expect(evidenceFor(state, 'blk_pp2', 'mowing').hours).toBe(1)
    expect(evidenceFor(state, 'blk_per', 'mowing')).toEqual({ logs: 0, hours: 0 })
  })

  it('explains a single log', () => {
    const state = withLogs([])
    const log: WorkLog = {
      id: 'log_x',
      date: '2026-06-01',
      personIds: ['per_1'],
      durationMinutes: 120,
      targets: [{ kind: 'species', species: 'pawpaw' }],
      createdAt: 1,
      updatedAt: 1,
    }
    const a = allocateLog(state, log, blockAreas(state))
    expect([...a.blocks.entries()]).toEqual([
      ['blk_pp1', 1.6],
      ['blk_pp2', 0.4],
    ])
  })
})
