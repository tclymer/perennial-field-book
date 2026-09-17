import { describe, expect, it } from 'vitest'
import { applyEvents, emptyState, live, materialize, sortEvents } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import { planKey } from '@/model/types'

let seq = 0
/** Stamp a new event with a timestamp; the device and id default so order is by ts. */
function stamp(e: NewEvent, ts: number, deviceId = 'dev-a'): AnyEvent {
  seq += 1
  return { id: `evt_${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId, ts, ...e }
}

const block = (ts = 1) =>
  stamp(
    {
      type: 'block.create',
      payload: {
        id: 'blk_1',
        code: 'PP1',
        name: 'Pawpaws Block 1',
        numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
      },
    },
    ts,
  )

const row = (ts = 2) =>
  stamp(
    {
      type: 'row.create',
      payload: {
        id: 'row_1',
        blockId: 'blk_1',
        number: 1,
        polyline: [
          [-77.083, 40.179],
          [-77.082, 40.179],
        ],
        layout: { by: 'count', count: 20 },
      },
    },
    ts,
  )

describe('reducer', () => {
  it('creates, patches, and clears fields with null', () => {
    const s = materialize([
      block(1),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', notes: 'trial block' } }, 2),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', species: 'pawpaw' } }, 3),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', notes: null } }, 4),
    ])
    const b = s.blocks.blk_1
    expect(b.name).toBe('Pawpaws Block 1')
    expect(b.species).toBe('pawpaw')
    expect('notes' in b).toBe(false)
    expect(b.createdAt).toBe(1)
    expect(b.updatedAt).toBe(4)
    expect(s.applied).toBe(4)
    expect(s.lastTs).toBe(4)
  })

  it('lets the later writer win per field, whatever order events arrive in', () => {
    const events = [
      block(1),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', name: 'Old name' } }, 5, 'dev-b'),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', name: 'New name' } }, 6, 'dev-a'),
      stamp({ type: 'block.patch', payload: { id: 'blk_1', species: 'pawpaw' } }, 4, 'dev-b'),
    ]
    const shuffled = [events[2], events[0], events[3], events[1]]
    const a = materialize(events)
    const b = materialize(shuffled)
    expect(a).toEqual(b)
    expect(a.blocks.blk_1.name).toBe('New name')
    expect(a.blocks.blk_1.species).toBe('pawpaw')
  })

  it('breaks timestamp ties by device then id', () => {
    const x = stamp({ type: 'block.patch', payload: { id: 'blk_1', name: 'from b' } }, 9, 'dev-b')
    const y = stamp({ type: 'block.patch', payload: { id: 'blk_1', name: 'from a' } }, 9, 'dev-a')
    expect(sortEvents([x, y]).map((e) => e.deviceId)).toEqual(['dev-a', 'dev-b'])
    expect(materialize([block(1), x, y]).blocks.blk_1.name).toBe('from b')
  })

  it('keeps deleted things as tombstones and restores them exactly', () => {
    const s1 = materialize([
      block(1),
      row(2),
      stamp({ type: 'row.delete', payload: { id: 'row_1' } }, 3),
    ])
    expect(s1.rows.row_1.deleted).toBe(true)
    expect(live.rows(s1)).toEqual([])
    const s2 = applyEvents(s1, [stamp({ type: 'row.restore', payload: { id: 'row_1' } }, 4)])
    expect(s2.rows.row_1.deleted).toBeUndefined()
    expect(live.rows(s2)).toHaveLength(1)
    // Rows of a deleted block are hidden without cascading events.
    const s3 = applyEvents(s2, [stamp({ type: 'block.delete', payload: { id: 'blk_1' } }, 5)])
    expect(live.rows(s3)).toEqual([])
    expect(s3.rows.row_1.deleted).toBeUndefined()
  })

  it('ignores a patch for something that does not exist, and unknown types', () => {
    const s = materialize([
      stamp({ type: 'row.patch', payload: { id: 'row_missing', number: 2 } }, 1),
      { id: 'evt_x', farmId: 'farm_1', deviceId: 'dev-a', ts: 2, type: 'weather.log', payload: {} },
    ])
    expect(s.rows).toEqual({})
    expect(s.applied).toBe(0)
  })

  it('applies tree history to the tree: graft sets variety, death sets status', () => {
    const s = materialize([
      stamp(
        { type: 'variety.create', payload: { id: 'var_a', species: 'pawpaw', name: 'Shenandoah' } },
        1,
      ),
      stamp(
        { type: 'variety.create', payload: { id: 'var_b', species: 'pawpaw', name: 'Wabash' } },
        1,
      ),
      stamp(
        { type: 'tree.create', payload: { id: 'tree_1', posKey: 'row_1:3', varietyId: 'var_a' } },
        2,
      ),
      stamp(
        {
          type: 'tree.event',
          payload: {
            id: 'tev_1',
            treeId: 'tree_1',
            kind: 'grafted',
            date: '2027-04-10',
            varietyId: 'var_b',
          },
        },
        3,
      ),
      stamp(
        {
          type: 'tree.event',
          payload: { id: 'tev_2', treeId: 'tree_1', kind: 'fruited', date: '2029-09-01' },
        },
        4,
      ),
      stamp(
        {
          type: 'tree.event',
          payload: { id: 'tev_3', treeId: 'tree_1', kind: 'died', date: '2030-05-01' },
        },
        5,
      ),
    ])
    const t = s.trees.tree_1
    expect(t.status).toBe('dead')
    expect(t.varietyId).toBe('var_b')
    expect(t.graftedDate).toBe('2027-04-10')
    expect(t.firstFruitYear).toBe(2029)
    expect(live.treeEvents(s, 'tree_1').map((e) => e.kind)).toEqual(['grafted', 'fruited', 'died'])
  })

  it('lets a new tree take the position of a dead one, keeping both', () => {
    const s = materialize([
      stamp({ type: 'tree.create', payload: { id: 'tree_1', posKey: 'row_1:3' } }, 1),
      stamp(
        {
          type: 'tree.event',
          payload: { id: 'tev_1', treeId: 'tree_1', kind: 'removed', date: '2026-03-01' },
        },
        2,
      ),
      stamp(
        { type: 'tree.create', payload: { id: 'tree_2', posKey: 'row_1:3', varietyId: 'var_b' } },
        3,
      ),
    ])
    const here = live.trees(s).filter((t) => t.posKey === 'row_1:3')
    expect(here.map((t) => t.id)).toEqual(['tree_1', 'tree_2'])
    expect(s.trees.tree_1.status).toBe('removed')
    expect(s.trees.tree_2.status).toBe('alive')
  })

  it('hides a deleted history event', () => {
    const s = materialize([
      stamp({ type: 'tree.create', payload: { id: 'tree_1', posKey: 'row_1:3' } }, 1),
      stamp(
        {
          type: 'tree.event',
          payload: {
            id: 'tev_1',
            treeId: 'tree_1',
            kind: 'note',
            date: '2026-03-01',
            note: 'oops',
          },
        },
        2,
      ),
      stamp({ type: 'tree.event.delete', payload: { id: 'tev_1' } }, 3),
    ])
    expect(live.treeEvents(s, 'tree_1')).toEqual([])
  })

  it('tracks a graft plan from painted to done', () => {
    const key = planKey(2027, 'row_1:3')
    const s1 = materialize([
      stamp(
        { type: 'graft.plan', payload: { year: 2027, posKey: 'row_1:3', varietyId: 'var_b' } },
        1,
      ),
    ])
    expect(s1.plans[key]).toEqual({ year: 2027, posKey: 'row_1:3', varietyId: 'var_b' })
    const s2 = applyEvents(s1, [
      stamp(
        { type: 'graft.done', payload: { year: 2027, posKey: 'row_1:3', treeEventId: 'tev_9' } },
        2,
      ),
    ])
    expect(s2.plans[key].doneEventId).toBe('tev_9')
    const s3 = applyEvents(s2, [
      stamp({ type: 'graft.unplan', payload: { year: 2027, posKey: 'row_1:3' } }, 3),
    ])
    expect(s3.plans[key]).toBeUndefined()
  })

  it('nudges a position and clears the nudge with null', () => {
    const s1 = materialize([
      stamp(
        { type: 'position.nudge', payload: { posKey: 'row_1:3', coord: [-77.0825, 40.1791] } },
        1,
      ),
    ])
    expect(s1.nudges['row_1:3']).toEqual([-77.0825, 40.1791])
    const s2 = applyEvents(s1, [
      stamp({ type: 'position.nudge', payload: { posKey: 'row_1:3', coord: null } }, 2),
    ])
    expect(s2.nudges['row_1:3']).toBeUndefined()
  })

  it('creates the farm once and patches it after', () => {
    const s = materialize([
      stamp(
        {
          type: 'farm.create',
          payload: { id: 'farm_1', name: 'Threefold', center: [-77.083, 40.179], zoom: 17 },
        },
        1,
      ),
      stamp({ type: 'farm.patch', payload: { name: 'Threefold Farm' } }, 2),
    ])
    expect(s.farm?.name).toBe('Threefold Farm')
    expect(s.farm?.createdAt).toBe(1)
  })

  it('is the same whether applied all at once or one event at a time', () => {
    const events = [
      block(1),
      row(2),
      stamp({ type: 'tree.create', payload: { id: 'tree_1', posKey: 'row_1:1' } }, 3),
      stamp(
        { type: 'row.patch', payload: { id: 'row_1', layout: { by: 'spacing', spacingFt: 11 } } },
        4,
      ),
      stamp(
        {
          type: 'feature.create',
          payload: {
            id: 'ftr_1',
            name: 'Blue House',
            kind: 'greenhouse',
            geometry: { type: 'Point', coordinates: [-77.0828, 40.1793] },
          },
        },
        5,
      ),
    ]
    const whole = materialize(events)
    let step = emptyState()
    for (const e of sortEvents(events)) step = applyEvents(step, [e])
    expect(step).toEqual(whole)
    expect(applyEvents(whole, [])).not.toBe(whole)
  })
})
