/**
 * The week planner's writes (DESIGN.md §3.10). Each returns the events that undo it, for the
 * toast. Rollover itself writes nothing; see engine/plan.ts.
 */
import type { NewEvent } from '@/events/types'
import { live } from '@/events/reduce'
import { newId } from '@/model/ids'
import { nextWorkDay, planDay, weekPlan, workDaysOf } from '@/engine/plan'
import { ensureCurrentPerson } from './people'
import { useFarmStore } from './store'
import { completeTask } from './taskActions'

function state() {
  return useFarmStore.getState().state
}

function commit(events: NewEvent[]) {
  return useFarmStore.getState().commit(events)
}

/** Put a task on a day, or take it off with null. */
export function planTask(id: string, day: string | null): NewEvent[] {
  const t = state().tasks[id]
  if (!t) return []
  commit([{ type: 'task.patch', payload: { id, plannedFor: day } }])
  return [{ type: 'task.patch', payload: { id, plannedFor: t.plannedFor ?? null } }]
}

/** Still on: plan it for today, which starts its count again. */
export function keepForToday(id: string, today: string): NewEvent[] {
  return planTask(id, planDay(today, workDaysOf(state().farm)))
}

/** Still on, no: off the day and back in its list. */
export function backToList(id: string): NewEvent[] {
  return planTask(id, null)
}

/** "I'll take it": the person holding this phone becomes the owner. */
export function takeTask(id: string): NewEvent[] {
  const t = state().tasks[id]
  const me = ensureCurrentPerson()
  if (!t || !me) return []
  commit([{ type: 'task.patch', payload: { id, ownerId: me.id } }])
  return [{ type: 'task.patch', payload: { id, ownerId: t.ownerId ?? null } }]
}

export function assignTask(id: string, ownerId: string | null): NewEvent[] {
  const t = state().tasks[id]
  if (!t) return []
  commit([{ type: 'task.patch', payload: { id, ownerId } }])
  return [{ type: 'task.patch', payload: { id, ownerId: t.ownerId ?? null } }]
}

/** Rain day: everything still open on today moves to the next worked day. */
export function rainDay(today: string): { undo: NewEvent[]; to: string } {
  const s = state()
  const workDays = workDaysOf(s.farm)
  const plan = weekPlan(s, today)
  const to = nextWorkDay(plan.today, workDays)
  const open = plan.days.find((d) => d.isToday)?.open ?? []
  if (open.length === 0) return { undo: [], to }
  commit(open.map(({ task }) => ({ type: 'task.patch', payload: { id: task.id, plannedFor: to } })))
  return {
    undo: open.map(({ task }) => ({
      type: 'task.patch',
      payload: { id: task.id, plannedFor: task.plannedFor ?? null },
    })),
    to,
  }
}

/**
 * One tap from a day: file a log as the person holding the phone, with the task's estimate
 * if it has one. A one-off task is done. A plate or a project on a day was worked on, and
 * stays a plate or an open project; if that happened ahead of its day, its day becomes
 * today so the log counts for it.
 */
export function quickDone(id: string, today: string): { undo: NewEvent[]; logId?: string } {
  const t = state().tasks[id]
  if (!t) return { undo: [] }
  const me = ensureCurrentPerson()
  const sheet = {
    personIds: me ? [me.id] : [],
    ...(t.estimatedMinutes ? { durationMinutes: t.estimatedMinutes } : {}),
  }
  const undo: NewEvent[] = []
  if (
    (t.bucket === 'recurring' || t.bucket === 'project') &&
    t.plannedFor &&
    t.plannedFor > today
  ) {
    undo.push(...planTask(id, today))
  }
  if (t.bucket === 'project') {
    const logId = logOnly(id, today, sheet)
    return { undo: [{ type: 'log.delete', payload: { id: logId } }, ...undo], logId }
  }
  undo.unshift(...completeTask(id, sheet))
  const logId = live
    .logs(state())
    .filter((l) => l.taskId === id)
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.id
  return { undo, logId }
}

/** A log against a project that leaves the project open. */
function logOnly(
  taskId: string,
  date: string,
  sheet: { personIds: string[]; durationMinutes?: number },
): string {
  const t = state().tasks[taskId]!
  const logId = newId('log')
  commit([
    {
      type: 'log.create',
      payload: {
        id: logId,
        date,
        personIds: sheet.personIds,
        ...(sheet.durationMinutes !== undefined ? { durationMinutes: sheet.durationMinutes } : {}),
        ...(t.category ? { category: t.category } : {}),
        targets: t.targets,
        taskId,
      },
    },
  ])
  return logId
}

export function setWorkDays(days: number[]): void {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort()
  commit([{ type: 'farm.patch', payload: { workDays: sorted } }])
}
