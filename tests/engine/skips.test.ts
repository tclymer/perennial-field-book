import { describe, expect, it } from 'vitest'
import { allPositions, allSlots, occupiedMaxIndex, positionsForRow } from '@/engine/layout'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import type { Block, Row } from '@/model/types'

const BLOCK = {
  id: 'blk',
  code: 'GH',
  numbering: { rowsFrom: 'W', positionsFrom: 'the door' },
} as Block

function row(skips?: number[]): Row {
  return {
    id: 'row_1',
    blockId: 'blk',
    number: 1,
    polyline: [
      [-77.0832, 40.17935],
      [-77.0828, 40.17935],
    ],
    layout: { by: 'count', count: 12 },
    ...(skips ? { skips } : {}),
  } as Row
}

describe('taking a spot out of a row', () => {
  it('numbers the trees that remain with no gap', () => {
    const ps = positionsForRow(BLOCK, row([3]), {})
    const live = ps.filter((p) => !p.skipped)
    expect(live).toHaveLength(11)
    expect(live.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(live.map((p) => p.label).slice(0, 4)).toEqual(['GH-1-1', 'GH-1-2', 'GH-1-3', 'GH-1-4'])
  })

  it('leaves every key where it was, so nothing recorded has to be rewritten', () => {
    const before = positionsForRow(BLOCK, row(), {}).map((p) => p.posKey)
    const after = positionsForRow(BLOCK, row([3]), {}).map((p) => p.posKey)
    expect(after).toEqual(before)
  })

  it('keeps the tree that was numbered 4 pointing at the same key once it is numbered 3', () => {
    const was = positionsForRow(BLOCK, row(), {}).find((p) => p.index === 4)!
    const now = positionsForRow(BLOCK, row([3]), {}).find((p) => p.index === 3)!
    expect(now.posKey).toBe(was.posKey)
    expect(now.coord).toEqual(was.coord)
    expect(now.label).toBe('GH-1-3')
  })

  it('gives a taken-out spot a label that cannot be mistaken for a live one', () => {
    const gone = positionsForRow(BLOCK, row([3]), {}).find((p) => p.skipped)!
    expect(gone.label).toBe('GH-1-3 (removed)')
    expect(gone.index).toBe(0)
    expect(gone.slot).toBe(3)
  })

  it('puts a spot back in its own place, not at the end', () => {
    const thinned = positionsForRow(BLOCK, row([3]), {})
    const back = positionsForRow(BLOCK, row(), {})
    const key = thinned.find((p) => p.skipped)!.posKey
    expect(back.find((p) => p.posKey === key)!.index).toBe(3)
    expect(back.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('thins a fig row to every fourth tree and numbers the survivors one to three', () => {
    // Plant twelve, thin progressively: the ones left keep the spots they physically occupy.
    const keep = new Set([1, 5, 9])
    const skips = [...Array(12)].map((_, i) => i + 1).filter((n) => !keep.has(n))
    const ps = positionsForRow(BLOCK, row(skips), {})
    const live = ps.filter((p) => !p.skipped)
    expect(live.map((p) => p.index)).toEqual([1, 2, 3])
    expect(live.map((p) => p.slot)).toEqual([1, 5, 9])
    const full = positionsForRow(BLOCK, row(), {})
    for (const p of live) {
      expect(p.coord).toEqual(full.find((q) => q.slot === p.slot)!.coord)
    }
  })
})

function state(events: NewEvent[]) {
  return materialize(
    events.map((e, i) => ({
      id: `evt_${i}`,
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000 + i,
      ...e,
    })) as AnyEvent[],
  )
}

const SEED: NewEvent[] = [
  {
    type: 'farm.create',
    payload: { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 },
  },
  {
    type: 'block.create',
    payload: {
      id: 'blk',
      code: 'GH',
      name: 'Greenhouse',
      numbering: { rowsFrom: 'W', positionsFrom: 'the door' },
    },
  },
  {
    type: 'row.create',
    payload: {
      id: 'row_1',
      blockId: 'blk',
      number: 1,
      polyline: [
        [-77.0832, 40.17935],
        [-77.0828, 40.17935],
      ],
      layout: { by: 'count', count: 12 },
    },
  },
]

describe('the farm state with spots taken out', () => {
  it('leaves them out of the live positions but still resolves their key', () => {
    const s = state([...SEED, { type: 'row.patch', payload: { id: 'row_1', skips: [3] } }])
    expect(allPositions(s)).toHaveLength(11)
    expect(allSlots(s)).toHaveLength(12)
    expect(allSlots(s).find((p) => p.posKey === 'row_1:3')?.skipped).toBe(true)
  })

  it('does not let a removed tree keep a row long', () => {
    const withTree: NewEvent[] = [
      ...SEED,
      { type: 'tree.create', payload: { id: 'tree_12', posKey: 'row_1:12', status: 'alive' } },
    ]
    expect(occupiedMaxIndex(state(withTree), 'row_1')).toBe(12)
    // Once the spot is taken out, the row is free to be shortened again.
    const thinned = state([
      ...withTree,
      { type: 'row.patch', payload: { id: 'row_1', skips: [12] } },
    ])
    expect(occupiedMaxIndex(thinned, 'row_1')).toBe(0)
  })
})
