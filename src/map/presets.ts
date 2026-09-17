/**
 * Basemap imagery sources. The farm's layout is traced once against the sharpest imagery
 * available; afterwards the drawn geometry is the truth and any of these will do.
 * Measured over Threefold Farm on 2026-09-16: see DESIGN.md §8.1 and §8.4.
 */
import type { CustomTiles, DevicePrefs } from '@/state/device'
import { CACHEABLE_TILE_RE } from './cacheable'

export type LngLat = [number, number]
export type Bounds = [west: number, south: number, east: number, north: number]

export interface BasemapSpec {
  id: string
  name: string
  /** XYZ tile URL templates with {z}/{x}/{y}. */
  tiles: string[]
  maxzoom: number
  attribution: string
  /** Where the source has imagery; outside it MapLibre requests nothing. */
  bounds?: Bounds
  /** Whether the service worker may keep these tiles for offline use. */
  cacheable: boolean
  /** When the imagery was flown, for the credit line and the offline note. */
  vintage?: string
}

export const PA_BOUNDS: Bounds = [-80.52, 39.72, -74.69, 42.27]

export const PRESETS = {
  pema: {
    id: 'pema',
    name: 'Pennsylvania imagery (PEMA 2018–2020)',
    tiles: [
      'https://apps.pasda.psu.edu/arcgis/rest/services/PEMAImagery2018_WEB/MapServer/tile/{z}/{y}/{x}',
    ],
    maxzoom: 19,
    attribution: 'Imagery: PEMA 2018–2020 via PASDA, Penn State',
    bounds: PA_BOUNDS,
    cacheable: true,
    vintage: '2018–2020',
  },
  esri: {
    id: 'esri',
    name: 'Esri World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    maxzoom: 19,
    attribution: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    cacheable: false,
  },
  usgs: {
    id: 'usgs',
    name: 'USGS imagery (coarse)',
    tiles: [
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    ],
    maxzoom: 16,
    attribution: 'Imagery: USGS The National Map',
    bounds: [-179.9, 17.5, -64.5, 71.5],
    cacheable: true,
  },
} as const satisfies Record<string, BasemapSpec>

export type PresetId = keyof typeof PRESETS

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

function within(b: Bounds, [lon, lat]: LngLat): boolean {
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]
}

/** The best free preset for a location: the state service where one exists, Esri elsewhere. */
export function autoPreset(center: LngLat): PresetId {
  return within(PA_BOUNDS, center) ? 'pema' : 'esri'
}

export function customSpec(c: CustomTiles): BasemapSpec {
  return {
    id: 'custom',
    name: 'Custom tiles',
    tiles: [c.url],
    maxzoom: c.maxzoom,
    attribution: c.attribution,
    cacheable: CACHEABLE_TILE_RE.test(c.url.replace(/\{[xyz]\}/g, '0')),
  }
}

/** The free imagery a device has chosen, or `null` for no imagery at all. */
export function presetFor(prefs: DevicePrefs, center: LngLat): BasemapSpec | null {
  const choice = prefs.basemap ?? autoPreset(center)
  if (choice === 'none') return null
  if (choice === 'custom') return prefs.customTiles ? customSpec(prefs.customTiles) : null
  return PRESETS[choice]
}
