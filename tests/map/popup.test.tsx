// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMapPopup } from '@/map/useMapPopup'
import { useEditor } from '@/ui/map/editorStore'

/**
 * A popup that records what it was shown, standing in for MapLibre's. Hoisted, because the
 * hook reaches for maplibre-gl through a dynamic import and the mock has to be in place
 * before that module is ever resolved.
 */
const { FakePopup } = vi.hoisted(() => {
  class FakePopup {
    static last: FakePopup | null = null
    html = ''
    node: HTMLElement | null = null
    open = false
    setLngLat() {
      return this
    }
    setHTML(h: string) {
      this.html = h
      return this
    }
    setDOMContent(el: HTMLElement) {
      this.node = el
      this.html = el.outerHTML
      return this
    }
    addTo() {
      this.open = true
      FakePopup.last = this
      return this
    }
    remove() {
      this.open = false
      return this
    }
    isOpen() {
      return this.open
    }
  }
  return { FakePopup }
})

vi.mock('maplibre-gl', () => ({ Popup: FakePopup }))

type Handler = (e: unknown) => void

/** Enough of a map to drive the hook: layer-scoped click handlers and a feature query. */
function fakeMap(underPoint: Record<string, GeoJSON.Feature[]>) {
  const handlers = new Map<string, Handler[]>()
  return {
    handlers,
    getCanvas: () => ({ style: {} }),
    getLayer: (id: string) => (id in underPoint ? { id } : undefined),
    queryRenderedFeatures: (_box: unknown, opts?: { layers?: string[] }) =>
      (opts?.layers ?? []).flatMap((l) => underPoint[l] ?? []),
    on: (type: string, layer: string, fn: Handler) => {
      const key = `${type}:${layer}`
      handlers.set(key, [...(handlers.get(key) ?? []), fn])
    },
    off: () => {},
    fire(type: string, layer: string, e: unknown) {
      for (const fn of handlers.get(`${type}:${layer}`) ?? []) fn(e)
    },
  }
}

const TREE: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: { label: 'GRH-1-4', posKey: 'row_1:4', variety: 'Adriatic JH', status: 'alive' },
}
const BLOCK: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: { id: 'blk_1', code: 'GRH', name: 'Greenhouse', tasks: 0, due: 0 },
}

const click = { lngLat: { lng: 0, lat: 0 }, point: { x: 100, y: 100 } }

beforeEach(() => {
  FakePopup.last = null
  useEditor.setState({ tool: 'none', editMode: 'none' })
})

/** The handlers reach for MapLibre through a dynamic import, so give that a real tick. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('tapping in the orchard', () => {
  it('opens the tree, not the block it stands in', async () => {
    // The block outline lies under every tree, and its handler is registered last, so
    // without a precedence rule it replaced the tree popup and the tree actions with it.
    const map = fakeMap({ 'position-dot': [TREE], 'block-fill': [BLOCK] })
    renderHook(() => useMapPopup(map as never))

    map.fire('click', 'position-dot', { ...click, features: [TREE] })
    map.fire('click', 'block-fill', { ...click, features: [BLOCK] })
    await settle()

    expect(FakePopup.last?.html).toContain('GRH-1-4')
    expect(FakePopup.last?.html).toContain('Adriatic JH')
    expect(FakePopup.last?.html).not.toContain('Block grid')
  })

  it('offers taking the spot out of the row on a tree', async () => {
    const map = fakeMap({ 'position-dot': [TREE] })
    renderHook(() => useMapPopup(map as never))
    map.fire('click', 'position-dot', { ...click, features: [TREE] })
    await settle()
    const button = FakePopup.last?.node?.querySelector('.fb-popup-actions button')
    expect(button?.textContent).toBe('Take out of the row')
  })

  it('opens the tree even when the tap lands just beside it', async () => {
    const map = fakeMap({ 'position-dot': [TREE], 'block-fill': [BLOCK] })
    renderHook(() => useMapPopup(map as never))
    // Only the block was hit outright; the tree is within a few pixels.
    map.fire('click', 'block-fill', { ...click, features: [BLOCK] })
    await settle()
    expect(FakePopup.last?.html).toContain('GRH-1-4')
  })

  it('still opens the block when no tree is near', async () => {
    const map = fakeMap({ 'position-dot': [], 'block-fill': [BLOCK] })
    renderHook(() => useMapPopup(map as never))
    map.fire('click', 'block-fill', { ...click, features: [BLOCK] })
    await settle()
    expect(FakePopup.last?.html).toContain('GRH')
    expect(FakePopup.last?.html).toContain('Block grid')
  })

  it('keeps the links short', async () => {
    const map = fakeMap({ 'position-dot': [], 'block-fill': [BLOCK] })
    renderHook(() => useMapPopup(map as never))
    map.fire('click', 'block-fill', { ...click, features: [BLOCK] })
    await settle()
    expect(FakePopup.last?.html).not.toContain('Open the block grid')
  })

  it('says nothing while a drawing tool is in use', async () => {
    useEditor.setState({ tool: 'row' })
    const map = fakeMap({ 'position-dot': [TREE] })
    renderHook(() => useMapPopup(map as never))
    map.fire('click', 'position-dot', { ...click, features: [TREE] })
    await settle()
    expect(FakePopup.last).toBeNull()
  })
})
