/**
 * The week planner (DESIGN.md §3.10). A day is a label on a task, `plannedFor`, and where an
 * unfinished task shows is computed from that label and today, never written: nothing runs
 * overnight, and two phones cannot disagree about where a task rolled.
 */
import type { FarmMeta, FarmState, Task, WorkLog } from '@/model/types'
import { live } from '@/events/reduce'
import { addDays, daysBetween, isProject } from './tasks'

/** ISO weekdays, Monday 1 to Sunday 7. */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5]

/** Working days a task may slide before it stops riding along and asks "Still on?". */
export const ROLL_LIMIT = 3

export function workDaysOf(farm: FarmMeta | null | undefined): readonly number[] {
  return farm?.workDays?.length ? farm.workDays : DEFAULT_WORK_DAYS
}

export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  return day === 0 ? 7 : day
}

export function isWorkDay(iso: string, workDays: readonly number[]): boolean {
  return workDays.includes(weekdayOf(iso))
}

/** The day itself if it is worked, otherwise the next one that is. */
export function workDayOnOrAfter(iso: string, workDays: readonly number[]): string {
  let d = iso
  for (let i = 0; i < 7 && !isWorkDay(d, workDays); i++) d = addDays(d, 1)
  return d
}

/** The next worked day strictly after this one. */
export function nextWorkDay(iso: string, workDays: readonly number[]): string {
  return workDayOnOrAfter(addDays(iso, 1), workDays)
}

/**
 * The day planning is about: today when it is worked, otherwise the next worked day. On a
 * Saturday that is Monday, which is what puts the board onto next week for the weekend.
 */
export function planDay(today: string, workDays: readonly number[]): string {
  return workDayOnOrAfter(today, workDays)
}

/** The worked days of the week that holds the plan day, Monday first. */
export function workingWeek(today: string, workDays: readonly number[]): string[] {
  const anchor = planDay(today, workDays)
  const monday = addDays(anchor, 1 - weekdayOf(anchor))
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    if (isWorkDay(d, workDays)) days.push(d)
  }
  return days
}

/** The worked days of the week after the plan day's: what can be planned ahead. */
export function nextWeek(today: string, workDays: readonly number[]): string[] {
  const anchor = planDay(today, workDays)
  return workingWeek(addDays(anchor, 8 - weekdayOf(anchor)), workDays)
}

/** Worked days after `from` up to and including `to`: how far a task has slid. */
export function workDaysBetween(from: string, to: string, workDays: readonly number[]): number {
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkDay(d, workDays)) n++
  return n
}

/**
 * When a planned task was dealt with, if it was. A one-off task is done. A plate or a project
 * on a day means "do one / work on it that day", so a log for it on or after its day settles
 * it and leaves it what it was: a plate, or an open project.
 */
export function settledOn(task: Task, logs: readonly WorkLog[]): string | undefined {
  if (task.bucket !== 'recurring' && !isProject(task)) {
    return task.done ? (task.doneAt ?? task.plannedFor) : undefined
  }
  if (!task.plannedFor) return undefined
  let first: string | undefined
  for (const l of logs) {
    if (l.taskId !== task.id || l.deleted || l.date < task.plannedFor) continue
    if (!first || l.date < first) first = l.date
  }
  return first
}

/** The day an open planned task shows on: its own day, or today once that has passed. */
export function showsOn(task: Task, today: string, workDays: readonly number[]): string | null {
  if (!task.plannedFor) return null
  const own = workDayOnOrAfter(task.plannedFor, workDays)
  const now = planDay(today, workDays)
  return own > now ? own : now
}

/** Worked days an open task has slid past its day. */
export function rolls(task: Task, today: string, workDays: readonly number[]): number {
  if (!task.plannedFor) return 0
  const own = workDayOnOrAfter(task.plannedFor, workDays)
  return workDaysBetween(own, planDay(today, workDays), workDays)
}

export interface PlanItem {
  task: Task
  /** Worked days slid, for the ↻ mark. */
  rolled: number
  /** Dealt with: done, or a plate or project worked on that day. */
  settled: boolean
  /** For a step: the task it belongs to, named beside it so it reads out of context. */
  parent?: Task
}

export interface PlanDay {
  date: string
  isToday: boolean
  /** Not settled, in list order. */
  open: PlanItem[]
  /** Settled on this day, shown crossed out. */
  settled: PlanItem[]
  /** Sum of estimates on the open tasks that have one. */
  minutes: number
}

export interface WeekPlan {
  /** The plan day: today, or the next worked day. */
  today: string
  days: PlanDay[]
  /** Slid ROLL_LIMIT days or more: off today's list until someone decides. */
  stillOn: PlanItem[]
  /** The week after, laid out the same way: what has been planned ahead. */
  next: PlanDay[]
  /** Open and planned past next week. */
  later: PlanItem[]
}

const byOrder = (a: PlanItem, b: PlanItem) =>
  a.task.order - b.task.order || a.task.createdAt - b.task.createdAt

/** Every planned task placed on its day of the working week. */
export function weekPlan(state: FarmState, today: string): WeekPlan {
  const workDays = workDaysOf(state.farm)
  const week = workingWeek(today, workDays)
  const now = planDay(today, workDays)
  const logs = live.logs(state)
  const ahead = nextWeek(today, workDays)
  const days = new Map<string, PlanDay>(
    [...week, ...ahead].map((date) => [
      date,
      { date, isToday: date === now, open: [], settled: [], minutes: 0 },
    ]),
  )
  const stillOn: PlanItem[] = []
  const later: PlanItem[] = []

  const tasks = live.tasks(state)
  // A task with steps is a holder: its steps go on days, never the task itself, whatever day
  // it carried from before holders existed.
  const holders = new Set(tasks.filter((t) => t.projectId).map((t) => t.projectId!))
  for (const task of tasks) {
    if (!task.plannedFor || holders.has(task.id)) continue
    const parent = task.projectId ? state.tasks[task.projectId] : undefined
    const settled = settledOn(task, logs)
    if (settled) {
      days.get(settled)?.settled.push({ task, rolled: 0, settled: true, parent })
      continue
    }
    if (task.done) continue
    const rolled = rolls(task, today, workDays)
    const item = { task, rolled, settled: false, parent }
    if (rolled >= ROLL_LIMIT) {
      stillOn.push(item)
      continue
    }
    const on = showsOn(task, today, workDays)!
    const day = days.get(on)
    if (!day) {
      if (on > ahead[ahead.length - 1]!) later.push(item)
      continue
    }
    day.open.push(item)
    day.minutes += task.estimatedMinutes ?? 0
  }
  for (const d of days.values()) {
    d.open.sort(byOrder)
    d.settled.sort(byOrder)
  }
  stillOn.sort(byOrder)
  later.sort((a, b) => a.task.plannedFor!.localeCompare(b.task.plannedFor!) || byOrder(a, b))
  return {
    today: now,
    days: week.map((d) => days.get(d)!),
    next: ahead.map((d) => days.get(d)!),
    stillOn,
    later,
  }
}

/** "Mon", "Tue": short enough for a chip. */
export function dayShort(iso: string): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayOf(iso) - 1]!
}

/** Weeks from the week holding `today` to the week holding `iso`, Monday first. */
export function weeksAhead(iso: string, today: string): number {
  const monday = (d: string) => addDays(d, 1 - weekdayOf(d))
  return Math.round(daysBetween(monday(today), monday(iso)) / 7)
}

/**
 * "Monday", or "Today" and "Tomorrow" where those are what it is, and "Next Monday" for a day
 * in the week after, so a Friday's "Monday" and a Monday's "Monday" are never confused.
 */
export function dayLong(iso: string, today: string): string {
  if (iso === today) return 'Today'
  if (daysBetween(today, iso) === 1) return 'Tomorrow'
  const name = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
    weekdayOf(iso) - 1
  ]!
  const weeks = weeksAhead(iso, today)
  if (weeks === 1) return `Next ${name}`
  if (weeks > 1) return `${name} ${Number(iso.slice(8))}`
  return name
}

/** "3", or "3 · ~4 h" when the open tasks carry estimates. */
export function loadLabel(day: PlanDay): string {
  const n = String(day.open.length)
  if (!day.minutes) return n
  const h = day.minutes / 60
  return `${n} · ~${h < 1 ? `${Math.round(day.minutes)} min` : `${Math.round(h * 2) / 2} h`}`
}

/** Open tasks grouped for Today: mine first, then each person, then Anyone. */
export function byPerson(
  items: PlanItem[],
  me: string | null,
  nameOf: (id: string) => string | undefined,
): { personId: string | null; label: string; items: PlanItem[] }[] {
  const groups = new Map<string | null, PlanItem[]>()
  for (const it of items) {
    const owner = it.task.ownerId && nameOf(it.task.ownerId) ? it.task.ownerId : null
    groups.set(owner, [...(groups.get(owner) ?? []), it])
  }
  const out: { personId: string | null; label: string; items: PlanItem[] }[] = []
  if (me && groups.has(me)) out.push({ personId: me, label: 'Yours', items: groups.get(me)! })
  const others = [...groups.keys()]
    .filter((k): k is string => k !== null && k !== me)
    .sort((a, b) => nameOf(a)!.localeCompare(nameOf(b)!))
  for (const k of others) out.push({ personId: k, label: nameOf(k)!, items: groups.get(k)! })
  if (groups.has(null)) out.push({ personId: null, label: 'Anyone', items: groups.get(null)! })
  return out
}
