import { describe, expect, it } from 'vitest'
import { EVENT_TYPES, PAYLOADS, exportBundle, parseEvent } from '@/model/schema'

const env = { id: 'evt_1', farmId: 'farm_1', deviceId: 'dev', ts: 5 }

describe('event validation', () => {
  it('checks known payloads', () => {
    expect(() =>
      parseEvent({
        ...env,
        type: 'block.create',
        payload: { id: 'blk_1', code: 'PP-1', name: 'x' },
      }),
    ).toThrow()
    const ok = parseEvent({
      ...env,
      type: 'block.create',
      payload: {
        id: 'blk_1',
        code: 'PP1',
        name: 'Pawpaws',
        numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
      },
    })
    expect(ok.type).toBe('block.create')
  })

  it('passes unknown types through untouched', () => {
    const e = parseEvent({ ...env, type: 'harvest.log', payload: { lb: 12 } })
    expect(e.payload).toEqual({ lb: 12 })
  })

  it('rejects a broken envelope', () => {
    expect(() => parseEvent({ ...env, ts: -1, type: 'farm.patch', payload: {} })).toThrow()
    expect(() => parseEvent({ type: 'farm.patch', payload: {} })).toThrow()
  })

  it('has a payload schema for every event type', () => {
    for (const t of EVENT_TYPES) expect(PAYLOADS[t]).toBeDefined()
    expect(EVENT_TYPES).toContain('tree.event')
  })

  it('accepts a bundle without photos', () => {
    const b = exportBundle.parse({
      app: 'perennial-field-book',
      formatVersion: 1,
      appVersion: '0.1.0',
      exportedAt: '2026-09-16T00:00:00.000Z',
      farmId: 'farm_1',
      events: [],
    })
    expect(b.photos).toBeUndefined()
  })
})
