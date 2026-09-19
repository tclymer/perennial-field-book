import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  dueState,
  parseSeason,
  parseTitle,
  sortRecurring,
  thisWeek,
  weeklyReview,
  type ParseContext,
} from '@/engine/tasks'
import { emptyState } from '@/events/reduce'
import type { FarmState, Task, WorkLog } from '@/model/types'

const ctx: ParseContext = {
  blocks: [
    { id: 'blk_pp1', code: 'PP1', name: 'Pawpaws Block 1', species: 'pawpaw' },
    { id: 'blk_pp2', code: 'PP2', name: 'Pawpaws Block 2', species: 'pawpaw' },
    { id: 'blk_per', code: 'PER', name: 'Persimmons', species: 'persimmon' },
    { id: 'blk_y', code: 'Y', name: 'Yard' },
  ],
  rows: [1, 2, 3, 4, 5].map((n) => ({ id: `row_pp1_${n}`, blockId: 'blk_pp1', number: n })),
  features: [
    { id: 'ftr_gray', name: 'Gray House' },
    { id: 'ftr_barn', name: 'Barn' },
  ],
  people: [
    { id: 'per_tim', name: 'Tim' },
    { id: 'per_mar', name: 'Marissa' },
    { id: 'per_kat', name: 'Kat' },
  ],
  labels: ['PP1-3-12', 'Y-1'],
}

describe('parseTitle', () => {
  it('finds a block, its rows, and the category', () => {
    const p = parseTitle('prune pawpaw block 1 rows 1-4', ctx)
    expect(p.title).toBe('Prune pawpaw block 1 rows 1-4')
    expect(p.category).toBe('pruning')
    expect(p.targets).toEqual([1, 2, 3, 4].map((n) => ({ kind: 'row', id: `row_pp1_${n}` })))
  })

  it('finds a block by code and does not add the block when rows are named', () => {
    expect(parseTitle('mow PP2', ctx).targets).toEqual([{ kind: 'block', id: 'blk_pp2' }])
    expect(parseTitle('weed PP1 row 3', ctx).targets).toEqual([{ kind: 'row', id: 'row_pp1_3' }])
    expect(parseTitle('fertilize the persimmons', ctx).targets).toEqual([
      { kind: 'block', id: 'blk_per' },
    ])
  })

  it('reads a crop word as every block of that crop', () => {
    expect(parseTitle('thin pawpaws', ctx).targets).toEqual([
      { kind: 'species', species: 'pawpaw' },
    ])
    // A named block wins over the crop word.
    expect(parseTitle('thin pawpaws in PP2', ctx).targets).toEqual([
      { kind: 'block', id: 'blk_pp2' },
    ])
  })

  it('moves a parenthetical to notes and reads the season from it', () => {
    const p = parseTitle(
      'Hang electric backup heaters in gray house (late fall after fig harvest)',
      ctx,
    )
    expect(p.title).toBe('Hang electric backup heaters in gray house')
    expect(p.targets).toEqual([{ kind: 'feature', id: 'ftr_gray' }])
    expect(p.category).toBe('construction')
    expect(p.season).toBe('late fall')
    expect(p.seasonMonths).toEqual([10, 11])
    expect(p.notes).toBe('late fall after fig harvest')
  })

  it('reads owners from parentheses and trailing dashes', () => {
    expect(parseTitle('Order posts for elderberries (mostly Tim)', ctx)).toMatchObject({
      title: 'Order posts for elderberries',
      ownerId: 'per_tim',
      category: 'admin',
    })
    expect(parseTitle('Fix the barn door - Marissa', ctx)).toMatchObject({
      title: 'Fix the barn door',
      ownerId: 'per_mar',
      category: 'maintenance',
      targets: [{ kind: 'feature', id: 'ftr_barn' }],
    })
    // A parenthetical that is not a person stays a note.
    expect(parseTitle('Buy tags (the metal ones)', ctx)).toMatchObject({
      title: 'Buy tags',
      notes: 'the metal ones',
    })
  })

  it('flags questions and discussion items', () => {
    expect(parseTitle('Remove the jujubes?', ctx)).toMatchObject({
      title: 'Remove the jujubes?',
      needsDiscussion: true,
    })
    expect(parseTitle('Windbreak species (needs discussion)', ctx)).toMatchObject({
      title: 'Windbreak species',
      needsDiscussion: true,
    })
    expect(parseTitle('question for Kat: burn day timing', ctx)).toMatchObject({
      needsDiscussion: true,
      ownerId: 'per_kat',
    })
  })

  it('reads seasons from the title, tree labels, the whole farm, and list markers', () => {
    expect(parseTitle('Paint the barn before cold weather', ctx)).toMatchObject({
      season: 'before cold weather',
      seasonMonths: [9, 10],
    })
    expect(parseTitle('burn pile as trees go dormant', ctx).seasonMonths).toEqual([10, 11])
    expect(parseTitle('scionwood from PP1-3-12 and y-1', ctx).targets).toEqual([
      { kind: 'block', id: 'blk_pp1' },
      { kind: 'tree', posKey: 'PP1-3-12' },
      { kind: 'tree', posKey: 'Y-1' },
    ])
    expect(parseTitle('mow the whole farm', ctx).targets).toEqual([{ kind: 'farm' }])
    expect(parseTitle('[x] water the pomegranates', ctx)).toMatchObject({
      title: 'Water the pomegranates',
      category: 'watering',
      done: true,
    })
    expect(parseTitle('- train kiwis', ctx)).toMatchObject({
      title: 'Train kiwis',
      category: 'training',
    })
    expect(parseTitle('See https://example.com/x for the plan', ctx)).toMatchObject({
      title: 'See for the plan',
      notes: 'https://example.com/x',
    })
  })

  it('parses month ranges', () => {
    expect(parseSeason('spray copper oct-nov')).toEqual({ season: 'oct-nov', months: [10, 11] })
    expect(parseSeason('mulch in March')).toEqual({ season: 'march', months: [3] })
    expect(parseSeason('nov through feb')?.months).toEqual([11, 12, 1, 2])
    expect(parseSeason('nothing seasonal')).toBeNull()
  })
})

const t = (patch: Partial<Task> & { id: string }): Task => ({
  title: patch.id,
  bucket: 'recurring',
  targets: [],
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})
const log = (taskId: string, date: string, id = `log_${taskId}_${date}`): WorkLog => ({
  id,
  date,
  personIds: ['per_tim'],
  durationMinutes: 30,
  targets: [],
  taskId,
  createdAt: 1,
  updatedAt: 1,
})

describe('recurring items', () => {
  const kiwis = t({ id: 'kiwis' })
  const figs = t({ id: 'figs', intervalDays: 7 })
  const winter = t({ id: 'winter', seasonMonths: [12, 1, 2] })
  const logs = [log('kiwis', '2026-09-01'), log('figs', '2026-09-15')]

  it('tells due, stale, ok, and out of season apart', () => {
    expect(dueState(kiwis, logs, '2026-09-19')).toBe('ok')
    expect(dueState(kiwis, logs, '2026-10-05')).toBe('stale')
    expect(dueState(figs, logs, '2026-09-19')).toBe('ok')
    expect(dueState(figs, logs, '2026-09-22')).toBe('due')
    expect(dueState(winter, logs, '2026-09-19')).toBe('out-of-season')
    expect(dueState(winter, logs, '2026-12-19')).toBe('stale')
    expect(dueState(t({ id: 'never' }), logs, '2026-09-19')).toBe('stale')
  })

  it('sorts the longest untouched first, in season before out', () => {
    const sorted = sortRecurring([figs, winter, kiwis, t({ id: 'never' })], logs, '2026-09-19')
    expect(sorted.map((x) => x.id)).toEqual(['never', 'kiwis', 'figs', 'winter'])
  })

  it('does date arithmetic across month ends', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3)
    expect(addDays('2026-09-19', -6)).toBe('2026-09-13')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

function farm(tasks: Task[], logs: WorkLog[]): FarmState {
  const s = emptyState()
  for (const x of tasks) s.tasks[x.id] = x
  for (const l of logs) s.logs[l.id] = l
  s.people.per_tim = { id: 'per_tim', name: 'Tim', active: true, createdAt: 1, updatedAt: 1 }
  return s
}

describe('this week and the review', () => {
  const state = farm(
    [
      t({ id: 'a', bucket: 'now', order: 2 }),
      t({ id: 'b', bucket: 'now', order: 1 }),
      t({ id: 'done', bucket: 'now', done: true }),
      t({ id: 'sub', bucket: 'now', projectId: 'proj' }),
      t({ id: 'proj', bucket: 'project' }),
      t({ id: 'kiwis' }),
      t({ id: 'figs', intervalDays: 7 }),
      t({ id: 'fresh' }),
      t({ id: 'fall', bucket: 'later', seasonMonths: [9, 10] }),
      t({ id: 'spring', bucket: 'later', seasonMonths: [3, 4] }),
      t({ id: 'q', bucket: 'soon', needsDiscussion: true }),
    ],
    [
      log('kiwis', '2026-08-01'),
      log('figs', '2026-09-10'),
      log('fresh', '2026-09-18'),
      log('done', '2026-09-17'),
    ],
  )

  it('lists Monkeys in order, due recurring items, and season-opened items', () => {
    const w = thisWeek(state, '2026-09-19')
    expect(w.now.map((x) => x.id)).toEqual(['b', 'a'])
    expect(w.due.map((x) => x.id)).toEqual(['kiwis', 'figs'])
    expect(w.opened.map((x) => x.id)).toEqual(['fall'])
  })

  it('reviews the last seven days', () => {
    const r = weeklyReview(state, '2026-09-19')
    expect(r.from).toBe('2026-09-13')
    expect(r.done.map((d) => d.task?.id)).toEqual(['fresh', 'done'])
    expect(r.stillNow.map((x) => x.id)).toEqual(['b', 'a'])
    expect(r.stale.map((x) => x.id)).toEqual(['kiwis', 'figs'])
    expect(r.opened.map((x) => x.id)).toEqual(['fall'])
    expect(r.discussion.map((x) => x.id)).toEqual(['q'])
    expect(r.suggestions.map((x) => x.id)).toEqual([])
  })
})
