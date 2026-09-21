import { describe, expect, it } from 'vitest'
import { parseEvent } from '@/model/schema'
import { materialize } from '@/events/reduce'
import type { AnyEvent } from '@/events/types'

function event(type: string, payload: unknown) {
  return { id: 'evt_1', farmId: 'farm_1', deviceId: 'dev', ts: 1_700_000_000_000, type, payload }
}

describe('an event carrying a field this build has never heard of', () => {
  it('keeps the field rather than dropping it', () => {
    // This is what an older phone does with an event from a newer desktop. Dropping the
    // field loses it for good, because what gets stored is what came back from here.
    const parsed = parseEvent(event('row.patch', { id: 'row_1', somethingNewer: [1, 2, 3] }))
    expect((parsed.payload as Record<string, unknown>).somethingNewer).toEqual([1, 2, 3])
  })

  it('keeps it through a whole known payload', () => {
    const parsed = parseEvent(
      event('row.patch', { id: 'row_1', skips: [3], aFieldFromNextYear: 'keep me' }),
    )
    const p = parsed.payload as Record<string, unknown>
    expect(p.skips).toEqual([3])
    expect(p.aFieldFromNextYear).toBe('keep me')
  })

  it('still refuses a payload that breaks a field it does know', () => {
    expect(() => parseEvent(event('row.patch', { id: 'row_1', skips: 'not a list' }))).toThrow()
    expect(() => parseEvent(event('row.patch', { skips: [1] }))).toThrow()
  })

  it('still lets an unknown event type through untouched', () => {
    const parsed = parseEvent(event('something.new', { whatever: true }))
    expect((parsed.payload as Record<string, unknown>).whatever).toBe(true)
  })

  it('survives the round trip into state, which is the point', () => {
    const events = [
      event('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }),
      event('block.create', {
        id: 'blk',
        code: 'GH',
        name: 'Greenhouse',
        numbering: { rowsFrom: 'W', positionsFrom: 'door' },
      }),
      event('row.create', {
        id: 'row_1',
        blockId: 'blk',
        number: 1,
        polyline: [
          [-77.0832, 40.17935],
          [-77.0828, 40.17935],
        ],
        layout: { by: 'count', count: 12 },
      }),
      event('row.patch', { id: 'row_1', skips: [1] }),
    ].map((e, i) => parseEvent({ ...e, id: `evt_${i}`, ts: 1_700_000_000_000 + i }) as AnyEvent)

    const state = materialize(events)
    expect(state.rows['row_1']?.skips).toEqual([1])
  })
})
