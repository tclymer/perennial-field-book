// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createFeature, createRow } from '@/state/actions'
import {
  addLog,
  completeTask,
  moveTask,
  nudgeTask,
  placeTask,
  quickAdd,
  reopenTask,
  setBucketName,
  undoCompletion,
  undoEvents,
  undoLog,
  updateTask,
} from '@/state/taskActions'
import { createPerson, currentPerson, ensureCurrentPerson, setCurrentPerson } from '@/state/people'
import { useDevice } from '@/state/device'
import { resetSyncForTests, useSync } from '@/sync/store'
import { fromLocal } from '@/engine/geo'
import { bucketName, thisWeek } from '@/engine/tasks'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  resetSyncForTests()
  useDevice.getState().set({ personId: null })
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
})

describe('quick add and completion', () => {
  it('parses places and people from the open farm and orders within the bucket', () => {
    const block = createBlock({ code: 'PP1', name: 'Pawpaws Block 1' })
    const row3 = createRow(block, [at(0, 0), at(0, 90)], { by: 'count', count: 10 })
    createRow(block, [at(16, 0), at(16, 90)], { by: 'count', count: 10 })
    const gray = createFeature('Gray House', 'greenhouse', {
      type: 'Point',
      coordinates: at(50, 50),
    })
    const tim = createPerson('Tim')

    const a = quickAdd('prune PP1 row 1')!
    const b = quickAdd('Water the gray house (Tim)')!
    const c = quickAdd('train kiwis', 'recurring')!
    const tasks = s().tasks
    expect(tasks[a]).toMatchObject({
      title: 'Prune PP1 row 1',
      bucket: 'now',
      category: 'pruning',
      targets: [{ kind: 'row', id: row3 }],
      order: 1,
    })
    expect(tasks[b]).toMatchObject({
      title: 'Water the gray house',
      category: 'watering',
      ownerId: tim,
      targets: [{ kind: 'feature', id: gray }],
      order: 2,
    })
    expect(tasks[c]).toMatchObject({ bucket: 'recurring', order: 1 })
    expect(quickAdd('   ')).toBeNull()

    // Order changes swap neighbours; moving lands at the end of the other bucket.
    nudgeTask(b, -1)
    expect(thisWeek(s(), '2026-09-19').now.map((t) => t.id)).toEqual([b, a])
    moveTask(a, 'soon')
    expect(s().tasks[a]).toMatchObject({ bucket: 'soon', order: 1 })

    // Dragging: into another list at a position, and under a parent as a subtask.
    const d = quickAdd('mulch', 'soon')!
    const e = quickAdd('stake', 'soon')!
    placeTask(b, { bucket: 'soon', projectId: null, index: 1 })
    const soon = live
      .tasks(s())
      .filter((t) => t.bucket === 'soon' && !t.projectId)
      .sort((x, y) => x.order - y.order)
      .map((t) => t.id)
    expect(soon).toEqual([a, b, d, e])
    expect(s().tasks[b]).toMatchObject({ order: 2 })
    placeTask(e, { bucket: 'soon', projectId: d, index: 0 })
    expect(s().tasks[e]).toMatchObject({ projectId: d, order: 1 })
    placeTask(a, { bucket: 'soon', projectId: null, index: 99 })
    expect(s().tasks[a]!.order).toBe(3)
  })

  it('files a log when a task is checked off, and keeps recurring tasks open', () => {
    const tim = createPerson('Tim')
    const mar = createPerson('Marissa')
    const once = quickAdd('Fix the gate')!
    const kiwis = quickAdd('train kiwis', 'recurring')!
    updateTask(kiwis, { estimatedMinutes: 20, category: 'training' })

    const undo = completeTask(once, {
      date: '2026-09-19',
      personIds: [tim, mar],
      durationMinutes: 60,
      notes: 'new hinge',
    })
    expect(s().tasks[once]).toMatchObject({ done: true, doneAt: '2026-09-19' })
    const logs = live.logs(s())
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      taskId: once,
      personIds: [tim, mar],
      durationMinutes: 60,
      category: 'maintenance',
      notes: 'new hinge',
    })

    completeTask(kiwis, { personIds: [tim], durationMinutes: 20 })
    expect(s().tasks[kiwis]!.done).toBeUndefined()
    expect(live.logs(s())).toHaveLength(2)
    expect(thisWeek(s(), '2026-09-19').due).toHaveLength(0)

    // Undo removes the log and reopens the task.
    undoEvents(undo)
    expect(s().tasks[once]!.done).toBeUndefined()
    expect(live.logs(s())).toHaveLength(1)
    reopenTask(once)
    expect(s().tasks[once]!.done).toBeUndefined()

    // Taking back a check-off removes the log and reopens a one-off task.
    const gate = quickAdd('Oil the gate')!
    completeTask(gate, { personIds: [tim], durationMinutes: 10 })
    const gateLog = live.logs(s()).find((l) => l.taskId === gate)!
    undoLog(gateLog.id)
    expect(s().tasks[gate]!.done).toBeUndefined()
    expect(s().logs[gateLog.id]!.deleted).toBe(true)

    // Undoing a completion from the task finds and removes its closing log; reopening keeps it.
    completeTask(gate, { personIds: [tim], durationMinutes: 10 })
    undoCompletion(gate)
    expect(s().tasks[gate]!.done).toBeUndefined()
    expect(live.logs(s()).filter((l) => l.taskId === gate)).toHaveLength(0)
    completeTask(gate, { personIds: [tim], durationMinutes: 10 })
    reopenTask(gate)
    expect(s().tasks[gate]!.done).toBeUndefined()
    expect(live.logs(s()).filter((l) => l.taskId === gate)).toHaveLength(1)

    const manual = addLog({
      personIds: [tim],
      durationMinutes: 30,
      category: 'mowing',
      targets: [{ kind: 'farm' }],
    })
    expect(s().logs[manual]).toMatchObject({ category: 'mowing', targets: [{ kind: 'farm' }] })
  })

  it('keeps a long pasted line by moving its tail into the notes', () => {
    const long =
      'run conduit to the barn and then across the yard to the new shed, being careful of the buried water line that runs diagonally from the well to the house and past the old orchard fence toward the road frontage where the gate is'
    const id = quickAdd(long)!
    const t = s().tasks[id]!
    expect(t.title.length).toBeLessThanOrEqual(200)
    expect(t.title.endsWith(' ')).toBe(false)
    expect(`${t.title} ${t.notes}`.replace(/\s+/g, ' ')).toBe(
      long[0]!.toUpperCase() + long.slice(1),
    )
  })

  it('renames buckets per farm', () => {
    expect(bucketName(s().farm, 'now')).toBe('Monkeys')
    setBucketName('now', 'Today')
    expect(bucketName(s().farm, 'now')).toBe('Today')
    expect(bucketName(s().farm, 'later')).toBe('Long Term')
  })
})

describe('the current person', () => {
  it('comes from the device, else the sign-in, creating or matching a person', () => {
    expect(currentPerson()).toBeNull()
    expect(ensureCurrentPerson()).toBeNull()
    useSync.getState().setSession({
      token: 't',
      user: { id: 'usr_1', email: 'tim.clymer@example.com', name: 'Tim Clymer', picture: null },
    })
    const tim = createPerson('Tim')
    const p = ensureCurrentPerson()
    expect(p?.id).toBe(tim)
    expect(s().people[tim]?.email).toBe('tim.clymer@example.com')
    expect(currentPerson()?.id).toBe(tim)

    // A different account with no match becomes a new person.
    setCurrentPerson(null)
    useSync.getState().setSession({
      token: 't',
      user: { id: 'usr_2', email: 'kat@example.com', name: 'Kat', picture: null },
    })
    const kat = ensureCurrentPerson()
    expect(kat?.name).toBe('Kat')
    expect(live.people(s())).toHaveLength(2)
    // Next time the email matches.
    setCurrentPerson(null)
    expect(ensureCurrentPerson()?.id).toBe(kat?.id)
  })
})
