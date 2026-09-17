import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/map/presets'
import {
  BASEMAP_LAYER,
  BASEMAP_SOURCE,
  FIRST_OVERLAY_LAYER,
  OVERLAY_SOURCES,
  buildStyle,
} from '@/map/style'

describe('buildStyle', () => {
  it('has no basemap when none is chosen, but every overlay source', () => {
    const s = buildStyle(null)
    expect(s.sources[BASEMAP_SOURCE]).toBeUndefined()
    for (const id of OVERLAY_SOURCES) expect(s.sources[id]).toBeDefined()
    expect(s.layers[0].type).toBe('background')
    expect(s.layers.some((l) => l.id === FIRST_OVERLAY_LAYER)).toBe(true)
  })

  it('puts the raster basemap beneath the first overlay layer', () => {
    const s = buildStyle(PRESETS.pema)
    const src = s.sources[BASEMAP_SOURCE]
    expect(src).toMatchObject({ type: 'raster', maxzoom: 19, tileSize: 256 })
    const ids = s.layers.map((l) => l.id)
    expect(ids.indexOf(BASEMAP_LAYER)).toBeLessThan(ids.indexOf(FIRST_OVERLAY_LAYER))
    expect(ids.indexOf(BASEMAP_LAYER)).toBeGreaterThan(ids.indexOf('background'))
  })

  it('serves glyphs from the app itself', () => {
    const s = buildStyle(null)
    expect(s.glyphs).toContain('/fonts/{fontstack}/{range}.pbf')
    expect(s.glyphs?.startsWith('http')).toBe(true)
  })
})
