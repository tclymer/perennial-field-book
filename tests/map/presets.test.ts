import { describe, expect, it } from 'vitest'
import { CACHEABLE_TILE_RE } from '@/map/cacheable'
import { PRESETS, autoPreset, customSpec, presetFor } from '@/map/presets'
import type { DevicePrefs } from '@/state/device'

const prefs = (patch: Partial<DevicePrefs> = {}): DevicePrefs => ({
  basemap: null,
  customTiles: null,
  googleEnabled: true,
  lastView: null,
  offlineMap: null,
  personId: null,
  lastCrop: null,
  ...patch,
})

const THREEFOLD: [number, number] = [-77.08304, 40.1794]
const MICHIGAN: [number, number] = [-85.6, 42.9]

describe('cacheable tiles', () => {
  it('allows the public state and federal imagery', () => {
    expect(
      CACHEABLE_TILE_RE.test(
        'https://apps.pasda.psu.edu/arcgis/rest/services/PEMAImagery2018_WEB/MapServer/tile/19/198142/149883',
      ),
    ).toBe(true)
    expect(
      CACHEABLE_TILE_RE.test(
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/16/24767/18735',
      ),
    ).toBe(true)
  })

  it('never matches Google or Esri', () => {
    expect(
      CACHEABLE_TILE_RE.test(
        'https://tile.googleapis.com/v1/2dtiles/19/149883/198142?session=abc&key=k',
      ),
    ).toBe(false)
    expect(
      CACHEABLE_TILE_RE.test(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/19/198142/149883',
      ),
    ).toBe(false)
  })

  it('agrees with the cacheable flag on every preset', () => {
    for (const p of Object.values(PRESETS)) {
      const sample = p.tiles[0].replace('{z}', '19').replace('{x}', '1').replace('{y}', '2')
      expect(CACHEABLE_TILE_RE.test(sample)).toBe(p.cacheable)
    }
  })
})

describe('presets', () => {
  it('picks the state service inside Pennsylvania and Esri elsewhere', () => {
    expect(autoPreset(THREEFOLD)).toBe('pema')
    expect(autoPreset(MICHIGAN)).toBe('esri')
  })

  it('honors an explicit choice', () => {
    expect(presetFor(prefs({ basemap: 'usgs' }), THREEFOLD)?.id).toBe('usgs')
    expect(presetFor(prefs({ basemap: 'none' }), THREEFOLD)).toBeNull()
    expect(presetFor(prefs(), THREEFOLD)?.id).toBe('pema')
  })

  it('builds a custom source and marks it cacheable only for known public hosts', () => {
    const c = customSpec({
      url: 'https://example.org/t/{z}/{x}/{y}.png',
      maxzoom: 20,
      attribution: 'me',
    })
    expect(c.tiles).toEqual(['https://example.org/t/{z}/{x}/{y}.png'])
    expect(c.cacheable).toBe(false)
    expect(presetFor(prefs({ basemap: 'custom' }), THREEFOLD)).toBeNull()
  })
})
