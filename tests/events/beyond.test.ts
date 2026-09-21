import { describe, expect, it } from 'vitest'
import { applyTo, canApply, emptyState, materialize } from '@/events/reduce'
import { parseEnvelope, parseEvent } from '@/model/schema'
import type { AnyEvent } from '@/events/types'

function ev(type: string, payload: unknown, i = 0): AnyEvent {
  return {
    id: `evt_${i}`,
    farmId: 'farm_1',
    deviceId: 'dev',
    ts: 1_700_000_000_000 + i,
    type,
    payload,
  } as AnyEvent
}

const SEED = [
  ev('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }, 0),
  ev(
    'block.create',
    { id: 'blk', code: 'GH', name: 'Greenhouse', numbering: { rowsFrom: 'W', positionsFrom: 'd' } },
    1,
  ),
]

describe('an event this build cannot act on', () => {
  it('is not applied, and is counted', () => {
    // A kind of feature some later build understands. Today it fails the enum.
    const state = materialize([
      ...SEED,
      ev(
        'feature.create',
        {
          id: 'ftr',
          name: 'Nursery bed',
          kind: 'nursery',
          geometry: { type: 'Point', coordinates: [-77.083, 40.1796] },
        },
        2,
      ),
    ])
    expect(state.features['ftr']).toBeUndefined()
    expect(state.beyond).toBe(1)
  })

  it('counts an event type it has never heard of', () => {
    const state = materialize([...SEED, ev('irrigation.run', { id: 'x', minutes: 20 }, 2)])
    expect(state.beyond).toBe(1)
    // The rest of the log is unaffected.
    expect(state.blocks['blk']?.code).toBe('GH')
  })

  it('is zero for a log this build understands', () => {
    expect(materialize(SEED).beyond).toBe(0)
  })

  it('would be applied by a build that does understand it', () => {
    // Standing in for a later build: the same event, once its shape is describable.
    const known = ev(
      'feature.create',
      {
        id: 'ftr',
        name: 'Blue House',
        kind: 'greenhouse',
        geometry: { type: 'Point', coordinates: [-77.083, 40.1796] },
      },
      2,
    )
    expect(canApply(known)).toBe(true)
    const state = materialize([...SEED, known])
    expect(state.features['ftr']?.name).toBe('Blue House')
    expect(state.beyond).toBe(0)
  })

  it('does not let a broken payload through the door either', () => {
    const draft = emptyState()
    expect(applyTo(draft, ev('block.create', { id: 'blk', code: '!!!' }, 0))).toBe(false)
    expect(draft.blocks['blk']).toBeUndefined()
    expect(draft.beyond).toBe(1)
  })
})

describe('keeping what cannot be described yet', () => {
  it('parses the envelope of an event whose payload is beyond this build', () => {
    const raw = {
      id: 'evt_1',
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000,
      type: 'feature.create',
      payload: { id: 'ftr', name: 'Nursery', kind: 'nursery' },
    }
    // The strict parse refuses it, so the tolerant one is what keeps it.
    expect(() => parseEvent(raw)).toThrow()
    const kept = parseEnvelope(raw)
    expect(kept.type).toBe('feature.create')
    expect((kept.payload as Record<string, unknown>).kind).toBe('nursery')
  })

  it('still refuses something that is not an event at all', () => {
    expect(() => parseEnvelope({ nonsense: true })).toThrow()
    expect(() => parseEnvelope(null)).toThrow()
  })
})
