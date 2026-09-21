// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useDraw, useHiddenShapes } from '@/map/useDraw'
import { useEditor } from '@/ui/map/editorStore'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'

/**
 * A stand-in for the drawing controller, so the wiring between an edit mode and the shapes
 * handed to the editor can be checked without a WebGL map.
 */
const { calls } = vi.hoisted(() => ({
  calls: { edit: [] as unknown[][], select: [] as (string | undefined)[], stopped: 0 },
}))

vi.mock('@/map/draw', () => ({
  createDraw: () => ({
    setShape: () => {},
    ensureShape: () => false,
    edit: (features: unknown[], select?: string) => {
      calls.edit.push(features)
      calls.select.push(select)
    },
    stopEditing: () => {
      calls.stopped += 1
    },
    destroy: () => {},
  }),
}))

const ev = (type: string, payload: unknown): NewEvent => ({ type, payload }) as NewEvent

const state = materialize(
  [
    ev('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }),
    ev('block.create', {
      id: 'blk',
      code: 'PP1',
      name: 'Pawpaws',
      numbering: { rowsFrom: 'W', positionsFrom: 'road' },
    }),
    ev('feature.create', {
      id: 'ftr_house',
      name: 'Blue House',
      kind: 'greenhouse',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [-77.0834, 40.1796],
          [-77.0831, 40.1796],
          [-77.0831, 40.1798],
          [-77.0834, 40.1798],
        ],
      },
    }),
    ev('feature.create', {
      id: 'ftr_barn',
      name: 'Goat barn',
      kind: 'building',
      geometry: { type: 'Point', coordinates: [-77.082, 40.1793] },
    }),
  ].map((e, i) => ({
    id: `evt_${i}`,
    farmId: 'farm_1',
    deviceId: 'dev',
    ts: 1_700_000_000_000 + i,
    ...e,
  })) as AnyEvent[],
)

/** The same farm, with an outline on the block and two rows in it. */
const withOutline = materialize(
  [
    ev('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }),
    ev('block.create', {
      id: 'blk',
      code: 'PP1',
      name: 'Pawpaws',
      numbering: { rowsFrom: 'W', positionsFrom: 'road' },
    }),
    ev('block.patch', {
      id: 'blk',
      outline: [
        [-77.0836, 40.179],
        [-77.0824, 40.179],
        [-77.0824, 40.1798],
        [-77.0836, 40.1798],
      ],
    }),
    ev('row.create', {
      id: 'row_a',
      blockId: 'blk',
      number: 1,
      polyline: [
        [-77.0835, 40.1792],
        [-77.0825, 40.1792],
      ],
      layout: { by: 'count', count: 6 },
    }),
    ev('row.create', {
      id: 'row_b',
      blockId: 'blk',
      number: 2,
      polyline: [
        [-77.0835, 40.1796],
        [-77.0825, 40.1796],
      ],
      layout: { by: 'count', count: 6 },
    }),
  ].map((e, i) => ({
    id: `evt_o${i}`,
    farmId: 'farm_1',
    deviceId: 'dev',
    ts: 1_700_000_000_000 + i,
    ...e,
  })) as AnyEvent[],
)

function fakeMap() {
  return {
    getCanvas: () => ({ style: {} }),
    getLayer: () => undefined,
    queryRenderedFeatures: () => [],
    on: () => {},
    off: () => {},
  }
}

beforeEach(() => {
  // Hooks from an earlier test stay subscribed to the editor store, so a later setState makes
  // their effects run again and push into these lists. Unmount them first.
  cleanup()
  calls.edit = []
  calls.select = []
  calls.stopped = 0
  useEditor.setState({
    editMode: 'none',
    editingFeatureId: null,
    selectedBlockId: null,
    tool: 'none',
  })
})

describe('reshaping a building or area', () => {
  it('hands that one shape to the editor, with its outline', () => {
    useEditor.getState().editFeature('ftr_house')
    renderHook(() => useDraw(fakeMap() as never, state, true))

    expect(calls.edit).toHaveLength(1)
    const loaded = calls.edit[0] as {
      id: string
      geometry: { shape: string; coordinates: unknown }
    }[]
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe('ftr_house')
    expect(loaded[0]!.geometry.shape).toBe('polygon')
  })

  it('hands over a point as a point', () => {
    useEditor.getState().editFeature('ftr_barn')
    renderHook(() => useDraw(fakeMap() as never, state, true))
    const loaded = calls.edit[0] as { geometry: { shape: string } }[]
    expect(loaded[0]!.geometry.shape).toBe('point')
  })

  it("hides the map's own copy so there are not two of it", () => {
    useEditor.getState().editFeature('ftr_house')
    const { result } = renderHook(() => useHiddenShapes(state))
    expect([...result.current.features]).toEqual(['ftr_house'])
    expect([...result.current.blocks]).toEqual([])
  })

  it('stops when the shape it was given has gone', () => {
    useEditor.getState().editFeature('ftr_gone')
    renderHook(() => useDraw(fakeMap() as never, state, true))
    expect(calls.edit).toHaveLength(0)
    expect(calls.stopped).toBeGreaterThan(0)
  })

  it('leaves the editor alone when nothing is being reshaped', () => {
    renderHook(() => useDraw(fakeMap() as never, state, true))
    expect(calls.edit).toHaveLength(0)
    const { result } = renderHook(() => useHiddenShapes(state))
    expect([...result.current.features]).toEqual([])
  })

  it('turns reshaping off, which also leaves the edit mode', () => {
    useEditor.getState().editFeature('ftr_house')
    expect(useEditor.getState().editMode).toBe('feature')
    useEditor.getState().editFeature(null)
    expect(useEditor.getState().editMode).toBe('none')
    expect(useEditor.getState().editingFeatureId).toBeNull()
  })

  it('opens on the shape itself, so there is something to grab', () => {
    useEditor.getState().editFeature('ftr_house')
    renderHook(() => useDraw(fakeMap() as never, state, true))
    expect(calls.select[0]).toBeUndefined()
  })

  it('forgets the shape when another edit mode takes over', () => {
    useEditor.getState().editFeature('ftr_house')
    useEditor.getState().setEditMode('trees')
    expect(useEditor.getState().editingFeatureId).toBeNull()
  })
})

describe('reshaping a block', () => {
  it('opens with the outline selected rather than nothing', () => {
    useEditor.setState({ selectedBlockId: 'blk', editMode: 'shapes' })
    renderHook(() => useDraw(fakeMap() as never, withOutline, true))

    const loaded = calls.edit[0] as { id: string }[]
    // The outline and both rows are loaded, and the outline is the one showing its corners:
    // Terra Draw draws them only on the selected shape, so opening with none looked broken.
    expect(loaded.map((f) => f.id)).toContain('outline:blk')
    expect(loaded).toHaveLength(3)
    expect(calls.select[0]).toBe('outline:blk')
  })

  it('opens on the first row when the block has no outline', () => {
    useEditor.setState({ selectedBlockId: 'blk', editMode: 'shapes' })
    renderHook(() => useDraw(fakeMap() as never, state, true))
    expect(calls.select[0]).toBeUndefined()
    expect(calls.edit[0]).toHaveLength(0)
  })
})
