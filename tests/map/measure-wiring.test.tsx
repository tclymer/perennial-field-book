// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useDraw } from '@/map/useDraw'
import { useEditor } from '@/ui/map/editorStore'
import { materialize } from '@/events/reduce'
import type { AnyEvent } from '@/events/types'
import type { DrawHandlers } from '@/map/draw'
import type { LngLat } from '@/model/types'

/** Keep hold of the handlers the hook gives the controller, so the test can play the library. */
const { captured } = vi.hoisted(() => ({ captured: { handlers: null as DrawHandlers | null } }))

vi.mock('@/map/draw', () => ({
  createDraw: (_map: unknown, handlers: DrawHandlers) => {
    captured.handlers = handlers
    return {
      setShape: () => {},
      ensureShape: () => false,
      edit: () => {},
      stopEditing: () => {},
      destroy: () => {},
    }
  },
}))

const state = materialize([
  {
    id: 'e0',
    farmId: 'farm_1',
    deviceId: 'dev',
    ts: 1_700_000_000_000,
    type: 'farm.create',
    payload: { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 },
  } as AnyEvent,
])

const fakeMap = () => ({
  getCanvas: () => ({ style: {} }),
  getLayer: () => undefined,
  queryRenderedFeatures: () => [],
  on: () => {},
  off: () => {},
})

const line: LngLat[] = [
  [-77.0832, 40.17935],
  [-77.0828, 40.17935],
]

beforeEach(() => {
  cleanup()
  captured.handlers = null
  useEditor.setState({ tool: 'none', editMode: 'none', measure: null, fill: null })
})

function mount() {
  renderHook(() => useDraw(fakeMap() as never, state, true))
  return captured.handlers!
}

describe('lengths while drawing', () => {
  it('shows the sides of a row as it is drawn', () => {
    const h = mount()
    act(() => h.onProvisional!({ shape: 'line', coordinates: line }, 1))
    expect(useEditor.getState().measure).toEqual({ coords: line, closed: false })
  })

  it('treats an area or outline as closed', () => {
    const h = mount()
    const ring: LngLat[] = [...line, [-77.0828, 40.1797]]
    act(() => h.onProvisional!({ shape: 'polygon', coordinates: ring }, 2))
    expect(useEditor.getState().measure).toEqual({ coords: ring, closed: true })
  })

  it('clears when the shape in progress is finished or abandoned', () => {
    const h = mount()
    act(() => h.onProvisional!({ shape: 'line', coordinates: line }, 1))
    act(() => h.onProvisional!(null, 0))
    expect(useEditor.getState().measure).toBeNull()
  })

  it('shows nothing for a point', () => {
    const h = mount()
    act(() => h.onProvisional!({ shape: 'point', coordinates: line[0]! }, 1))
    expect(useEditor.getState().measure).toBeNull()
  })
})

describe('lengths while reshaping', () => {
  it('follows a shape being dragged, and leaves the final lengths up afterwards', () => {
    const h = mount()
    act(() => h.onEditing!('row_1', { shape: 'line', coordinates: line }))
    expect(useEditor.getState().measure?.coords).toEqual(line)
    const moved: LngLat[] = [line[0]!, [-77.0826, 40.17935]]
    act(() => h.onEdited('row_1', { shape: 'line', coordinates: moved }))
    expect(useEditor.getState().measure?.coords).toEqual(moved)
  })

  it('shows a row when it is clicked', () => {
    const h = mount()
    act(() => h.onSelected!('row_1', { shape: 'line', coordinates: line }))
    expect(useEditor.getState().measure?.coords).toEqual(line)
  })

  it('ignores a deselect for a different shape, which can arrive after the new select', () => {
    const h = mount()
    act(() => h.onSelected!('row_2', { shape: 'line', coordinates: line }))
    act(() => h.onDeselected!('row_1'))
    expect(useEditor.getState().measure).not.toBeNull()
    act(() => h.onDeselected!('row_2'))
    expect(useEditor.getState().measure).toBeNull()
  })

  it('starts clear when a new tool is picked', () => {
    const h = mount()
    act(() => h.onSelected!('row_1', { shape: 'line', coordinates: line }))
    act(() => useEditor.getState().setTool('row'))
    expect(useEditor.getState().measure).toBeNull()
  })
})
