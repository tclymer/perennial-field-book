import { describe, expect, it } from 'vitest'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import { blockActivity, heat } from '@/map/activity'
import { blocksFC } from '@/map/geojson'

let seq = 0
function stamp(e: NewEvent, ts: number): AnyEvent {
  seq += 1
  return { id: `evt_m${String(seq).padStart(4, '0')}`, farmId: 'farm_1', deviceId: 'dev', ts, ...e }
}

const RING: [number, number][] = [
  [-77.084, 40.179],
  [-77.082, 40.179],
  [-77.082, 40.181],
  [-77.084, 40.181],
]

function farm() {
  const events: AnyEvent[] = []
  let ts = 1000
  const push = (e: NewEvent) => events.push(stamp(e, ts++))
  push({ type: 'farm.create', payload: { id: 'farm_1', name: 'F', center: [-77, 40], zoom: 17 } })
  for (const [id, code, species] of [
    ['blk_pp1', 'PP1', 'pawpaw'],
    ['blk_pp2', 'PP2', 'pawpaw'],
    ['blk_per', 'PER', 'persimmon'],
  ]) {
    push({
      type: 'block.create',
      payload: {
        id: id!,
        code: code!,
        name: code!,
        species: species!,
        numbering: { rowsFrom: 'N', positionsFrom: 'x' },
        outline: RING,
      },
    })
  }
  // Two tasks on PP1, one crop-wide task on both pawpaw blocks, one farm-wide task on none.
  push({
    type: 'task.create',
    payload: {
      id: 'tsk_1',
      title: 'Mow PP1',
      bucket: 'now',
      targets: [{ kind: 'block', id: 'blk_pp1' }],
    },
  })
  push({
    type: 'task.create',
    payload: {
      id: 'tsk_2',
      title: 'Weed PP1',
      bucket: 'soon',
      targets: [{ kind: 'block', id: 'blk_pp1' }],
    },
  })
  push({
    type: 'task.create',
    payload: {
      id: 'tsk_3',
      title: 'Thin pawpaws',
      bucket: 'now',
      targets: [{ kind: 'species', species: 'pawpaw' }],
    },
  })
  push({
    type: 'task.create',
    payload: { id: 'tsk_4', title: 'Mow everywhere', bucket: 'now', targets: [{ kind: 'farm' }] },
  })
  push({
    type: 'task.create',
    payload: {
      id: 'tsk_done',
      title: 'Already done',
      bucket: 'now',
      done: true,
      targets: [{ kind: 'block', id: 'blk_per' }],
    },
  })
  // A recurring item that is not due yet should not light anything up.
  push({
    type: 'task.create',
    payload: {
      id: 'tsk_rec',
      title: 'Train kiwis',
      bucket: 'recurring',
      targets: [{ kind: 'block', id: 'blk_per' }],
    },
  })
  push({
    type: 'log.create',
    payload: { id: 'log_1', date: '2026-09-18', personIds: [], taskId: 'tsk_rec' },
  })
  push({
    type: 'harvest.create',
    payload: {
      id: 'hrv_1',
      date: '2026-09-10',
      crop: 'pawpaw',
      blockId: 'blk_pp1',
      quantity: 40,
      unit: 'lb',
    },
  })
  push({
    type: 'harvest.create',
    payload: {
      id: 'hrv_2',
      date: '2025-09-10',
      crop: 'pawpaw',
      blockId: 'blk_pp2',
      quantity: 500,
      unit: 'lb',
    },
  })
  return materialize(events)
}

const state = farm()

describe('what is happening in each block', () => {
  const activity = blockActivity(state, '2026-09-20')

  it('counts the open tasks that point at a block, crop-wide ones included', () => {
    expect(
      activity
        .get('blk_pp1')
        ?.tasks.map((t) => t.id)
        .sort(),
    ).toEqual(['tsk_1', 'tsk_2', 'tsk_3'])
    // The crop task reaches the other pawpaw block too.
    expect(activity.get('blk_pp2')?.tasks.map((t) => t.id)).toEqual(['tsk_3'])
    // A done task, a farm-wide task, and a recurring item that is not due light nothing up.
    expect(activity.get('blk_per')).toBeUndefined()
  })

  it('totals this year’s harvest, not last year’s', () => {
    expect(activity.get('blk_pp1')?.harvest).toEqual([{ quantity: 40, unit: 'lb' }])
    expect(activity.get('blk_pp2')?.harvest).toEqual([])
  })

  it('shades the blocks and carries the numbers onto the map', () => {
    const tasks = blocksFC(state, new Set(), 'tasks', '2026-09-20')
    const pp1 = tasks.features.find((f) => f.properties?.code === 'PP1')!
    const per = tasks.features.find((f) => f.properties?.code === 'PER')!
    expect(pp1.properties).toMatchObject({ tasks: 3, heat: 1 })
    expect(per.properties).toMatchObject({ tasks: 0, heat: 1 })
    // The busiest block is the darkest; an empty one is grey.
    expect(pp1.properties!.color).not.toBe(per.properties!.color)
    expect(per.properties!.color).toBe('#d6d3d1')

    const yields = blocksFC(state, new Set(), 'yield', '2026-09-20')
    expect(yields.features.find((f) => f.properties?.code === 'PP1')!.properties).toMatchObject({
      harvest: '40 lb',
    })

    // Any other mode leaves the block its own colour and the usual faint wash.
    const plain = blocksFC(state, new Set(), 'variety')
    expect(plain.features[0]!.properties).toMatchObject({ heat: 0, color: '#a3e635' })
  })

  it('scales the shade with the count', () => {
    expect(heat(0, 5, 'amber')).toBe('#d6d3d1')
    expect(heat(1, 5, 'amber')).not.toBe(heat(5, 5, 'amber'))
    expect(heat(5, 5, 'lime')).toBe('#65a30d')
  })
})
