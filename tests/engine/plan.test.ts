import { describe, expect, it } from 'vitest'
import {
  byPerson,
  loadLabel,
  nextWorkDay,
  planDay,
  rolls,
  showsOn,
  weekPlan,
  workingWeek,
} from '@/engine/plan'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import type { Task } from '@/model/types'

// 2026-10-05 is a Monday.
const MON = '2026-10-05'
const TUE = '2026-10-06'
const WED = '2026-10-07'
const THU = '2026-10-08'
const FRI = '2026-10-09'
const SAT = '2026-10-10'
const NEXT_MON = '2026-10-12'
const WEEKDAYS = [1, 2, 3, 4, 5]

const ev = (type: string, payload: unknown): NewEvent => ({ type, payload }) as NewEvent

function state(extra: NewEvent[] = [], farm: Record<string, unknown> = {}) {
  const events: NewEvent[] = [
    ev('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }),
    ...(Object.keys(farm).length ? [ev('farm.patch', farm)] : []),
    ev('person.create', { id: 'per_tim', name: 'Tim' }),
    ev('person.create', { id: 'per_ann', name: 'Ann' }),
    ...extra,
  ]
  return materialize(
    events.map((e, i) => ({
      ...e,
      id: `e${i}`,
      farmId: 'farm_1',
      deviceId: 'd',
      ts: 1000 + i,
    })) as AnyEvent[],
  )
}

const task = (id: string, fields: Record<string, unknown>) =>
  ev('task.create', { id, title: id, bucket: 'now', order: 1, ...fields })

const plain = (fields: Partial<Task>): Task =>
  ({ id: 't', title: 't', bucket: 'now', targets: [], order: 1, ...fields }) as Task

describe('the working week', () => {
  it('is Monday to Friday of this week on a weekday', () => {
    expect(workingWeek(WED, WEEKDAYS)).toEqual([MON, TUE, WED, THU, FRI])
    expect(planDay(WED, WEEKDAYS)).toBe(WED)
  })

  it('turns to next week once the weekend starts, so Sunday planning lands on Monday', () => {
    expect(planDay(SAT, WEEKDAYS)).toBe(NEXT_MON)
    expect(workingWeek(SAT, WEEKDAYS)[0]).toBe(NEXT_MON)
    // Friday is still this week.
    expect(workingWeek(FRI, WEEKDAYS)[0]).toBe(MON)
  })

  it('takes Saturday as a working day when the farm says so', () => {
    expect(workingWeek(SAT, [1, 2, 3, 4, 5, 6])).toContain(SAT)
    expect(planDay(SAT, [1, 2, 3, 4, 5, 6])).toBe(SAT)
  })

  it('goes from Friday to Monday', () => {
    expect(nextWorkDay(FRI, WEEKDAYS)).toBe(NEXT_MON)
  })
})

describe('rollover, computed rather than written', () => {
  it('shows an unfinished task on today, counting the working days it slid', () => {
    const t = plain({ plannedFor: TUE })
    expect(showsOn(t, THU, WEEKDAYS)).toBe(THU)
    expect(rolls(t, THU, WEEKDAYS)).toBe(2)
  })

  it('leaves a task on its own day while that day is still ahead', () => {
    const t = plain({ plannedFor: THU })
    expect(showsOn(t, TUE, WEEKDAYS)).toBe(THU)
    expect(rolls(t, TUE, WEEKDAYS)).toBe(0)
  })

  it('does not count the weekend as sliding', () => {
    // Friday's leftover on Monday has slid one working day, not three.
    expect(rolls(plain({ plannedFor: FRI }), NEXT_MON, WEEKDAYS)).toBe(1)
  })
})

describe('the week plan', () => {
  it('puts each task on its day, and leftovers on today', () => {
    const s = state([task('a', { plannedFor: MON }), task('b', { plannedFor: THU })])
    const plan = weekPlan(s, WED)
    const on = (d: string) => plan.days.find((x) => x.date === d)!.open.map((i) => i.task.id)
    expect(on(WED)).toEqual(['a'])
    expect(on(THU)).toEqual(['b'])
    expect(on(MON)).toEqual([])
    expect(plan.days.find((x) => x.date === WED)!.open[0]!.rolled).toBe(2)
  })

  it('stops a task riding along after three days, and asks instead', () => {
    const s = state([task('a', { plannedFor: MON })])
    const plan = weekPlan(s, THU)
    expect(plan.stillOn.map((i) => i.task.id)).toEqual(['a'])
    expect(plan.days.find((d) => d.isToday)!.open).toEqual([])
  })

  it('keeps a done task on the day it was done, crossed out', () => {
    const s = state([task('a', { plannedFor: MON, done: true, doneAt: TUE })])
    const plan = weekPlan(s, WED)
    expect(plan.days.find((d) => d.date === TUE)!.settled.map((i) => i.task.id)).toEqual(['a'])
    expect(plan.days.find((d) => d.date === WED)!.open).toEqual([])
  })

  it('settles a project on a day by a log, and leaves the project open', () => {
    const s = state([
      task('p', { bucket: 'project', plannedFor: TUE }),
      ev('log.create', { id: 'l1', date: TUE, personIds: ['per_tim'], targets: [], taskId: 'p' }),
    ])
    const plan = weekPlan(s, WED)
    expect(plan.days.find((d) => d.date === TUE)!.settled.map((i) => i.task.id)).toEqual(['p'])
    expect(s.tasks.p!.done).toBeFalsy()
  })

  it('does not count an old log against a plate planned for later', () => {
    const s = state([
      task('m', { bucket: 'recurring', plannedFor: WED }),
      ev('log.create', { id: 'l1', date: MON, personIds: [], targets: [], taskId: 'm' }),
    ])
    expect(
      weekPlan(s, WED)
        .days.find((d) => d.isToday)!
        .open.map((i) => i.task.id),
    ).toEqual(['m'])
  })

  it('leaves alone tasks planned for no day', () => {
    const s = state([task('a', {})])
    expect(weekPlan(s, WED).days.every((d) => d.open.length === 0)).toBe(true)
  })

  it('adds up the estimates it has', () => {
    const s = state([
      task('a', { plannedFor: WED, estimatedMinutes: 120 }),
      task('b', { plannedFor: WED, estimatedMinutes: 90 }),
      task('c', { plannedFor: WED }),
    ])
    expect(loadLabel(weekPlan(s, WED).days.find((d) => d.isToday)!)).toBe('3 · ~3.5 h')
  })
})

describe('who it is for', () => {
  it('puts mine first, then each person by name, then Anyone', () => {
    const items = [
      { task: plain({ id: 'x' }), rolled: 0, settled: false },
      { task: plain({ id: 'y', ownerId: 'per_ann' }), rolled: 0, settled: false },
      { task: plain({ id: 'z', ownerId: 'per_tim' }), rolled: 0, settled: false },
    ]
    const names: Record<string, string> = { per_tim: 'Tim', per_ann: 'Ann' }
    const groups = byPerson(items, 'per_tim', (id) => names[id])
    expect(groups.map((g) => g.label)).toEqual(['Yours', 'Ann', 'Anyone'])
  })
})
