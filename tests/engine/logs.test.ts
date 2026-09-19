import { describe, expect, it } from 'vitest'
import { hoursOf, logsToCsv, targetLabel, totals } from '@/engine/logs'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import { seedEvents } from '../ui/fixtures'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_l${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

const state = materialize([
  ...seedEvents('farm_1'),
  stamp({ type: 'person.create', payload: { id: 'per_tim', name: 'Tim' } }, 1000),
  stamp({ type: 'person.create', payload: { id: 'per_mar', name: 'Marissa' } }, 1001),
  stamp(
    {
      type: 'log.create',
      payload: {
        id: 'log_1',
        date: '2026-09-10',
        personIds: ['per_tim', 'per_mar'],
        durationMinutes: 60,
        category: 'pruning',
        targets: [{ kind: 'row', id: 'row_1' }],
      },
    },
    1002,
  ),
  stamp(
    {
      type: 'log.create',
      payload: {
        id: 'log_2',
        date: '2026-08-30',
        personIds: ['per_tim'],
        durationMinutes: 90,
        category: 'mowing',
        targets: [{ kind: 'farm' }],
        notes: 'first pass, "rough"',
      },
    },
    1003,
  ),
  stamp(
    {
      type: 'log.create',
      payload: {
        id: 'log_3',
        date: '2026-09-12',
        personIds: ['per_mar'],
        durationMinutes: 30,
        category: 'spraying',
        targets: [{ kind: 'block', id: 'blk_pp1' }],
        materials: [
          { product: 'Surround', rate: '25 lb/100 gal', amount: 2, unit: 'lb', lot: 'A1' },
        ],
      },
    },
    1004,
  ),
  stamp(
    {
      type: 'log.create',
      payload: { id: 'log_4', date: '2026-09-12', personIds: [], category: 'admin', targets: [] },
    },
    1005,
  ),
])
const logs = Object.values(state.logs)

describe('log totals', () => {
  it('counts hours as duration times people', () => {
    expect(hoursOf(state.logs.log_1!)).toBe(2)
    expect(hoursOf(state.logs.log_4!)).toBe(0)
  })

  it('groups by category, person, month, and block', () => {
    expect(totals(state, logs, 'category').map((t) => [t.label, t.hours])).toEqual([
      ['Pruning', 2],
      ['Mowing', 1.5],
      ['Spraying', 0.5],
      ['Admin', 0],
    ])
    expect(totals(state, logs, 'person').map((t) => [t.label, t.hours])).toEqual([
      ['Tim', 2.5],
      ['Marissa', 1.5],
      ['Nobody named', 0],
    ])
    expect(totals(state, logs, 'month').map((t) => [t.label, t.hours])).toEqual([
      ['2026-09', 2.5],
      ['2026-08', 1.5],
    ])
    expect(totals(state, logs, 'block').map((t) => [t.label, t.hours])).toEqual([
      ['PP1 Pawpaws Block 1', 2.5],
      ['Whole farm', 1.5],
      ['Overhead', 0],
    ])
  })

  it('labels targets and writes CSV with quoting', () => {
    expect(targetLabel(state, { kind: 'row', id: 'row_1' })).toBe('PP1 row 1')
    expect(targetLabel(state, { kind: 'tree', posKey: 'row_1:1' })).toBe('PP1-1-1')
    const csv = logsToCsv(state, logs)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,people,minutes,hours,category,targets,task,materials,notes')
    expect(lines[1]).toBe('2026-08-30,Tim,90,1.50,Mowing,Whole farm,,,"first pass, ""rough"""')
    expect(lines[2]).toBe('2026-09-10,Tim; Marissa,60,2.00,Pruning,PP1 row 1,,,')
    expect(lines[3]).toContain('Surround 25 lb/100 gal 2 lb lot A1')
  })
})
