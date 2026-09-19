import { describe, expect, it } from 'vitest'
import { live, materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'

let seq = 0
function stamp(e: NewEvent, ts: number, deviceId = 'dev-a'): AnyEvent {
  seq += 1
  return { id: `evt_${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId, ts, ...e }
}

describe('people, tasks, and logs in the reducer', () => {
  it('creates, patches, deletes, and restores each kind with defaults filled in', () => {
    const s = materialize([
      stamp({ type: 'person.create', payload: { id: 'per_1', name: 'Tim' } }, 1),
      stamp(
        {
          type: 'task.create',
          payload: { id: 'tsk_1', title: 'Train kiwis', bucket: 'recurring' },
        },
        2,
      ),
      stamp(
        {
          type: 'task.create',
          payload: { id: 'tsk_2', title: 'Solar punch list', bucket: 'project', order: 3 },
        },
        3,
      ),
      stamp(
        {
          type: 'task.create',
          payload: {
            id: 'tsk_3',
            title: 'Mount inverter',
            bucket: 'now',
            projectId: 'tsk_2',
            targets: [{ kind: 'feature', id: 'ftr_barn' }],
            category: 'construction',
            ownerId: 'per_1',
          },
        },
        4,
      ),
      stamp(
        {
          type: 'log.create',
          payload: {
            id: 'log_1',
            date: '2026-09-19',
            personIds: ['per_1'],
            durationMinutes: 30,
            taskId: 'tsk_1',
          },
        },
        5,
      ),
      stamp({ type: 'task.patch', payload: { id: 'tsk_3', done: true, doneAt: '2026-09-19' } }, 6),
      stamp({ type: 'task.patch', payload: { id: 'tsk_3', ownerId: null } }, 7),
      stamp({ type: 'person.patch', payload: { id: 'per_1', active: false } }, 8),
    ])
    expect(s.people.per_1).toMatchObject({ name: 'Tim', active: false })
    expect(s.tasks.tsk_1).toMatchObject({ bucket: 'recurring', targets: [], order: 0 })
    expect(s.tasks.tsk_3).toMatchObject({ done: true, doneAt: '2026-09-19', projectId: 'tsk_2' })
    expect(s.tasks.tsk_3.ownerId).toBeUndefined()
    expect(s.logs.log_1).toMatchObject({ personIds: ['per_1'], targets: [], taskId: 'tsk_1' })
    expect(live.tasks(s)).toHaveLength(3)

    // Deleting a project hides its subtasks; restoring brings them back.
    const deleted = materialize([
      ...(Object.values(s).length ? [] : []),
      stamp({ type: 'task.delete', payload: { id: 'tsk_2' } }, 9),
    ])
    void deleted
    const s2 = materialize([
      stamp({ type: 'task.create', payload: { id: 'tsk_2', title: 'P', bucket: 'project' } }, 1),
      stamp(
        {
          type: 'task.create',
          payload: { id: 'tsk_3', title: 'C', bucket: 'now', projectId: 'tsk_2' },
        },
        2,
      ),
      stamp({ type: 'task.delete', payload: { id: 'tsk_2' } }, 3),
    ])
    expect(live.tasks(s2)).toHaveLength(0)
    const s3 = materialize([
      stamp({ type: 'task.create', payload: { id: 'tsk_2', title: 'P', bucket: 'project' } }, 1),
      stamp(
        {
          type: 'task.create',
          payload: { id: 'tsk_3', title: 'C', bucket: 'now', projectId: 'tsk_2' },
        },
        2,
      ),
      stamp({ type: 'task.delete', payload: { id: 'tsk_2' } }, 3),
      stamp({ type: 'task.restore', payload: { id: 'tsk_2' } }, 4),
      stamp({ type: 'log.create', payload: { id: 'log_1', date: '2026-01-01', personIds: [] } }, 5),
      stamp({ type: 'log.delete', payload: { id: 'log_1' } }, 6),
    ])
    expect(
      live
        .tasks(s3)
        .map((t) => t.id)
        .sort(),
    ).toEqual(['tsk_2', 'tsk_3'])
    expect(live.logs(s3)).toHaveLength(0)
    expect(s3.logs.log_1?.deleted).toBe(true)
  })

  it('keeps renamed buckets and added categories on the farm', () => {
    const s = materialize([
      stamp(
        {
          type: 'farm.create',
          payload: { id: 'farm_1', name: 'F', center: [-77, 40], zoom: 17 },
        },
        1,
      ),
      stamp({ type: 'farm.patch', payload: { bucketNames: { now: 'Today' } } }, 2),
      stamp({ type: 'farm.patch', payload: { categories: ['Beekeeping'] } }, 3),
    ])
    expect(s.farm?.bucketNames).toEqual({ now: 'Today' })
    expect(s.farm?.categories).toEqual(['Beekeeping'])
  })
})
