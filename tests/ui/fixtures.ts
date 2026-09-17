import type { AnyEvent, NewEvent } from '@/events/types'
import { materialize } from '@/events/reduce'
import type { FarmState } from '@/model/types'

/** A small farm: one block with two rows, a variety, a tree, and a greenhouse. */
export function seedEvents(farmId = 'farm_1'): AnyEvent[] {
  const list: NewEvent[] = [
    {
      type: 'farm.create',
      payload: { id: farmId, name: 'Test Farm', center: [-77.083, 40.1794], zoom: 17 },
    },
    {
      type: 'block.create',
      payload: {
        id: 'blk_pp1',
        code: 'PP1',
        name: 'Pawpaws Block 1',
        numbering: { rowsFrom: 'W', positionsFrom: 'the road end' },
        species: 'pawpaw',
        rowSpacingFt: 16,
      },
    },
    {
      type: 'row.create',
      payload: {
        id: 'row_1',
        blockId: 'blk_pp1',
        number: 1,
        polyline: [
          [-77.0835, 40.1792],
          [-77.0828, 40.1792],
        ],
        layout: { by: 'count', count: 10 },
        defaultVarietyId: 'var_shen',
      },
    },
    {
      type: 'row.create',
      payload: {
        id: 'row_2',
        blockId: 'blk_pp1',
        number: 2,
        polyline: [
          [-77.0835, 40.17925],
          [-77.0828, 40.17925],
        ],
        layout: { by: 'count', count: 10 },
      },
    },
    {
      type: 'variety.create',
      payload: { id: 'var_shen', species: 'pawpaw', name: 'Shenandoah' },
    },
    {
      type: 'tree.create',
      payload: {
        id: 'tree_1',
        posKey: 'row_1:1',
        varietyId: 'var_shen',
        plantedDate: '2019-05-01',
      },
    },
    {
      type: 'feature.create',
      payload: {
        id: 'ftr_blue',
        name: 'Blue House',
        kind: 'greenhouse',
        geometry: { type: 'Point', coordinates: [-77.0829, 40.1796] },
      },
    },
  ]
  return list.map((e, i) => ({
    id: `evt_seed_${i}`,
    farmId,
    deviceId: 'dev_test',
    ts: 1_700_000_000_000 + i,
    ...e,
  }))
}

export function seedState(): FarmState {
  return materialize(seedEvents())
}

/** jsdom lacks a few browser APIs the pages touch. */
export function installBrowserStubs() {
  if (!('ResizeObserver' in globalThis)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.assign(globalThis, { ResizeObserver: RO })
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        media: '',
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }),
    })
  }
}
