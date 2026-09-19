/**
 * Tasks and the logs that completing them files (DESIGN.md §3.3, §3.4). As in actions.ts,
 * each function turns an intent into events and commits them.
 */
import type { Bucket, Material, Target, Task } from '@/model/types'
import type { PayloadOf } from '@/model/schema'
import { newId } from '@/model/ids'
import { live } from '@/events/reduce'
import type { NewEvent } from '@/events/types'
import { contextFrom, parseTitle, type ParsedTitle } from '@/engine/tasks'
import { positions } from './derived'
import { today } from './actions'
import { useFarmStore } from './store'

function state() {
  return useFarmStore.getState().state
}

function commit(events: NewEvent[]) {
  return useFarmStore.getState().commit(events)
}

/** Parse a line against the open farm's places and people. */
export function parseLine(text: string): ParsedTitle {
  const s = state()
  return parseTitle(
    text,
    contextFrom(
      s,
      positions(s).map((p) => p.label),
    ),
  )
}

function nextOrder(bucket: Bucket, projectId?: string): number {
  let max = 0
  for (const t of live.tasks(state())) {
    const same = projectId ? t.projectId === projectId : t.bucket === bucket && !t.projectId
    if (same && t.order > max) max = t.order
  }
  return max + 1
}

export type TaskFields = Omit<PayloadOf<'task.create'>, 'id' | 'order'>

/** Create a task from its fields. */
export function createTask(fields: TaskFields): string {
  const id = newId('tsk')
  commit([
    {
      type: 'task.create',
      payload: { id, ...fields, order: nextOrder(fields.bucket, fields.projectId) },
    },
  ])
  return id
}

/** One typed line becomes a task with places, category, owner, and season filled in. */
export function quickAdd(text: string, bucket: Bucket = 'now', projectId?: string): string | null {
  const parsed = parseLine(text)
  if (!parsed.title) return null
  const { done, ...fields } = parsed
  return createTask({
    ...fields,
    bucket,
    ...(projectId ? { projectId } : {}),
    ...(done ? { done: true, doneAt: today() } : {}),
  })
}

export function updateTask(id: string, patch: Omit<PayloadOf<'task.patch'>, 'id'>): void {
  commit([{ type: 'task.patch', payload: { id, ...patch } }])
}

/** Move to another bucket, at the end of it. */
export function moveTask(id: string, bucket: Bucket): void {
  const t = state().tasks[id]
  if (!t) return
  commit([
    {
      type: 'task.patch',
      payload: { id, bucket, projectId: null, order: nextOrder(bucket) },
    },
  ])
}

/** Swap order with the neighbour above or below within the same bucket or project. */
export function nudgeTask(id: string, direction: -1 | 1): void {
  const t = state().tasks[id]
  if (!t) return
  const siblings = live
    .tasks(state())
    .filter((x) =>
      t.projectId ? x.projectId === t.projectId : x.bucket === t.bucket && !x.projectId && !x.done,
    )
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const i = siblings.findIndex((x) => x.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= siblings.length) return
  const other = siblings[j]!
  // Orders may collide after imports; give both fresh distinct values.
  const lo = Math.min(t.order, other.order)
  const hi = Math.max(t.order, other.order)
  const [a, b] = lo === hi ? [lo, lo + 1] : [lo, hi]
  commit([
    { type: 'task.patch', payload: { id: other.id, order: direction < 0 ? b : a } },
    { type: 'task.patch', payload: { id, order: direction < 0 ? a : b } },
  ])
}

export interface Placement {
  bucket: Bucket
  projectId: string | null
  /** Position among the open tasks of that list or project. */
  index: number
}

/** Put a task at a position in a list or under a parent, renumbering its new neighbours. */
export function placeTask(id: string, dest: Placement): void {
  const t = state().tasks[id]
  if (!t || dest.projectId === id) return
  const siblings = live
    .tasks(state())
    .filter(
      (x) =>
        x.id !== id &&
        !x.done &&
        (dest.projectId
          ? x.projectId === dest.projectId
          : x.bucket === dest.bucket && !x.projectId),
    )
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const at = Math.max(0, Math.min(dest.index, siblings.length))
  const ordered = [...siblings.slice(0, at), t, ...siblings.slice(at)]
  const events: NewEvent[] = []
  ordered.forEach((x, i) => {
    const patch: PayloadOf<'task.patch'> = { id: x.id }
    if (x.order !== i + 1) patch.order = i + 1
    if (x.id === id) {
      if (t.bucket !== dest.bucket) patch.bucket = dest.bucket
      if ((t.projectId ?? null) !== dest.projectId) patch.projectId = dest.projectId
    }
    if (Object.keys(patch).length > 1) events.push({ type: 'task.patch', payload: patch })
  })
  if (events.length) commit(events)
}

export function deleteTask(id: string): void {
  commit([{ type: 'task.delete', payload: { id } }])
}

export function restoreTask(id: string): void {
  commit([{ type: 'task.restore', payload: { id } }])
}

export function reopenTask(id: string): void {
  commit([{ type: 'task.patch', payload: { id, done: null, doneAt: null } }])
}

export interface DoneSheet {
  date?: string
  personIds: string[]
  durationMinutes?: number
  notes?: string
  materials?: Material[]
  /** Override the task's category or targets for this one log. */
  category?: string | null
  targets?: Target[]
}

/**
 * Check a task off: file a work log from the sheet and, unless the task is recurring, mark
 * it done. Returns the events that undo it.
 */
export function completeTask(id: string, sheet: DoneSheet): NewEvent[] {
  const t = state().tasks[id]
  if (!t) return []
  const logId = newId('log')
  const events: NewEvent[] = [
    {
      type: 'log.create',
      payload: {
        id: logId,
        date: sheet.date ?? today(),
        personIds: sheet.personIds,
        ...(sheet.durationMinutes !== undefined ? { durationMinutes: sheet.durationMinutes } : {}),
        ...(categoryFor(t, sheet) ? { category: categoryFor(t, sheet) } : {}),
        targets: sheet.targets ?? t.targets,
        taskId: id,
        ...(sheet.materials?.length ? { materials: sheet.materials } : {}),
        ...(sheet.notes ? { notes: sheet.notes } : {}),
      },
    },
  ]
  const inverse: NewEvent[] = [{ type: 'log.delete', payload: { id: logId } }]
  if (t.bucket !== 'recurring') {
    events.push({ type: 'task.patch', payload: { id, done: true, doneAt: sheet.date ?? today() } })
    inverse.push({ type: 'task.patch', payload: { id, done: null, doneAt: null } })
  }
  commit(events)
  return inverse
}

function categoryFor(t: Task, sheet: DoneSheet): string | undefined {
  if (sheet.category === null) return undefined
  return sheet.category ?? t.category
}

/** Take back a check-off: remove its log and, if the task was closed by it, reopen it. */
export function undoLog(logId: string): void {
  const log = state().logs[logId]
  if (!log || log.deleted) return
  const events: NewEvent[] = [{ type: 'log.delete', payload: { id: logId } }]
  const task = log.taskId ? state().tasks[log.taskId] : undefined
  if (task && task.done && task.bucket !== 'recurring') {
    events.push({ type: 'task.patch', payload: { id: task.id, done: null, doneAt: null } })
  }
  commit(events)
}

// Logs on their own

export interface LogInput {
  date?: string
  personIds: string[]
  durationMinutes?: number
  category?: string
  targets?: Target[]
  taskId?: string
  materials?: Material[]
  notes?: string
}

export function addLog(input: LogInput): string {
  const id = newId('log')
  commit([
    {
      type: 'log.create',
      payload: {
        id,
        date: input.date ?? today(),
        personIds: input.personIds,
        targets: input.targets ?? [],
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.materials?.length ? { materials: input.materials } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    },
  ])
  return id
}

export function updateLog(id: string, patch: Omit<PayloadOf<'log.patch'>, 'id'>): void {
  commit([{ type: 'log.patch', payload: { id, ...patch } }])
}

export function deleteLog(id: string): void {
  commit([{ type: 'log.delete', payload: { id } }])
}

// Farm-level settings for tasks

export function setBucketName(bucket: Bucket, name: string): void {
  const current = state().farm?.bucketNames ?? {}
  commit([{ type: 'farm.patch', payload: { bucketNames: { ...current, [bucket]: name.trim() } } }])
}

export function addCategory(name: string): void {
  const current = state().farm?.categories ?? []
  const n = name.trim()
  if (!n || current.includes(n)) return
  commit([{ type: 'farm.patch', payload: { categories: [...current, n] } }])
}

/** Commit a batch of events, used for undo. */
export function undoEvents(events: NewEvent[]): void {
  if (events.length) commit(events)
}
