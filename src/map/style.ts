/**
 * The map style: one raster basemap under GeoJSON layers for blocks, rows, positions, plan
 * marks, and features. Sources start empty and are filled with `setData` as state changes.
 */
import type {
  LayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { BasemapSpec } from './presets'

export const BASEMAP_SOURCE = 'basemap'
export const BASEMAP_LAYER = 'basemap'
/** Overlay sources, in the order their layers are stacked. */
export const OVERLAY_SOURCES = [
  'blocks',
  'rows',
  'features',
  'positions',
  'plan',
  'labels',
] as const
export type OverlaySource = (typeof OVERLAY_SOURCES)[number]

/** The first overlay layer; the basemap layer is inserted beneath it. */
export const FIRST_OVERLAY_LAYER = 'block-fill'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function glyphsUrl(): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost'
  const base = import.meta.env.BASE_URL ?? '/'
  return `${origin}${base}fonts/{fontstack}/{range}.pbf`
}

export function rasterSource(spec: BasemapSpec): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: spec.tiles,
    tileSize: 256,
    maxzoom: spec.maxzoom,
    attribution: spec.attribution,
    ...(spec.bounds ? { bounds: spec.bounds } : {}),
  }
}

export function overlayLayers(): LayerSpecification[] {
  return [
    {
      id: 'block-fill',
      type: 'fill',
      source: 'blocks',
      paint: { 'fill-color': ['coalesce', ['get', 'color'], '#a3e635'], 'fill-opacity': 0.1 },
    },
    {
      id: 'block-outline',
      type: 'line',
      source: 'blocks',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#a3e635'],
        'line-width': 2,
        'line-opacity': 0.9,
      },
    },
    {
      id: 'feature-fill',
      type: 'fill',
      source: 'features',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#f5f5f4', 'fill-opacity': 0.25 },
    },
    {
      id: 'feature-outline',
      type: 'line',
      source: 'features',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': '#f5f5f4', 'line-width': 1.5, 'line-dasharray': [3, 2] },
    },
    {
      id: 'feature-point',
      type: 'circle',
      source: 'features',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#f5f5f4',
        'circle-stroke-color': '#292524',
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'row-line',
      type: 'line',
      source: 'rows',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#fef08a'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 19, 2.5],
        'line-opacity': 0.8,
      },
    },
    {
      id: 'position-dot',
      type: 'circle',
      source: 'positions',
      minzoom: 16,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 2, 19, 6, 21, 10],
        'circle-color': ['coalesce', ['get', 'color'], '#ffffff'],
        'circle-stroke-color': '#1c1917',
        'circle-stroke-width': 1,
        'circle-opacity': ['case', ['boolean', ['get', 'empty'], false], 0.35, 0.95],
      },
    },
    {
      id: 'plan-ring',
      type: 'circle',
      source: 'plan',
      minzoom: 16,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 4, 19, 9, 21, 14],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': ['coalesce', ['get', 'color'], '#fbbf24'],
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'position-label',
      type: 'symbol',
      source: 'labels',
      minzoom: 19,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#fafaf9',
        'text-halo-color': '#1c1917',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'feature-label',
      type: 'symbol',
      source: 'features',
      minzoom: 15,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': 12,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#fafaf9',
        'text-halo-color': '#1c1917',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'block-label',
      type: 'symbol',
      source: 'blocks',
      minzoom: 14,
      maxzoom: 19,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': 13,
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': '#fafaf9',
        'text-halo-color': '#1c1917',
        'text-halo-width': 1.5,
      },
    },
  ]
}

export function buildStyle(basemap: BasemapSpec | null): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {}
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#292524' } },
  ]
  if (basemap) {
    sources[BASEMAP_SOURCE] = rasterSource(basemap)
    layers.push({ id: BASEMAP_LAYER, type: 'raster', source: BASEMAP_SOURCE })
  }
  for (const id of OVERLAY_SOURCES) sources[id] = { type: 'geojson', data: EMPTY }
  layers.push(...overlayLayers())
  return { version: 8, glyphs: glyphsUrl(), sources, layers }
}
