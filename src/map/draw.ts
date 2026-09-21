/**
 * Terra Draw wiring. Drawing a new shape hands its coordinates to the caller and forgets
 * it; the app then renders it from state. Editing loads existing shapes, keyed by entity
 * id, and reports each finished drag or vertex change.
 */
import type { Map as MlMap } from 'maplibre-gl'
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LngLat, Polyline, Ring } from '@/model/types'
import { newId } from '@/model/ids'
import { DRAW_PRECISION, snapCoord } from '@/engine/geo'

export type DrawShape = 'line' | 'polygon' | 'point'

export type DrawnGeometry =
  | { shape: 'line'; coordinates: Polyline }
  | { shape: 'polygon'; coordinates: Ring }
  | { shape: 'point'; coordinates: LngLat }

export interface EditableFeature {
  id: string
  geometry: DrawnGeometry
}

export interface DrawHandlers {
  onDrawn: (g: DrawnGeometry) => void
  onEdited: (id: string, g: DrawnGeometry) => void
  /** The shape being drawn right now, after every click or cursor move. */
  onProvisional?: (g: DrawnGeometry | null) => void
  /** A loaded shape while it is being dragged, before the drag ends. */
  onEditing?: (id: string, g: DrawnGeometry) => void
  /** Shapes the draw library refused to load, so an edit session can say so rather than look broken. */
  onRejected?: (count: number, reason: string) => void
}

export interface DrawController {
  /** Start drawing a shape, or stop drawing with null. */
  setShape: (shape: DrawShape | null) => void
  /** Make sure the drawing mode is still the one asked for; returns true if it had to be restored. */
  ensureShape: (shape: DrawShape) => boolean
  /** Load shapes for vertex and drag editing; replaces any previous set. */
  edit: (features: EditableFeature[]) => void
  stopEditing: () => void
  destroy: () => void
}

const MODE: Record<DrawShape, string> = { line: 'linestring', polygon: 'polygon', point: 'point' }

const LINE_STYLE = { lineStringColor: '#fef08a' as const, lineStringWidth: 3 }
const POLY_STYLE = {
  fillColor: '#a3e635' as const,
  fillOpacity: 0.15,
  outlineColor: '#a3e635' as const,
  outlineWidth: 2,
}
const POINT_STYLE = {
  pointColor: '#ffffff' as const,
  pointWidth: 6,
  pointOutlineColor: '#1c1917' as const,
  pointOutlineWidth: 1,
}

/**
 * Terra Draw refuses any feature whose coordinates carry more decimals than the adapter's
 * `coordinatePrecision`, and `addFeatures` drops those without raising, so every coordinate
 * is rounded on the way in. See `snapCoord`.
 */
function snapPair(c: readonly number[]): [number, number] {
  return snapCoord([c[0]!, c[1]!]) as [number, number]
}

/** Drop vertices that repeat the previous one, which a double click leaves behind. */
function dedupe(coords: LngLat[]): LngLat[] {
  return coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1])
}

function fromStore(f: GeoJSONStoreFeatures): DrawnGeometry | null {
  const g = f.geometry
  if (g.type === 'LineString') {
    return {
      shape: 'line',
      coordinates: dedupe(g.coordinates.map(([lon, lat]) => [lon, lat] as LngLat)),
    }
  }
  if (g.type === 'Polygon') {
    const ring = g.coordinates[0] ?? []
    const open = ring.length > 1 ? ring.slice(0, -1) : ring
    return {
      shape: 'polygon',
      coordinates: dedupe(open.map(([lon, lat]) => [lon, lat] as LngLat)),
    }
  }
  if (g.type === 'Point')
    return { shape: 'point', coordinates: [g.coordinates[0], g.coordinates[1]] }
  return null
}

function toStore(id: string, g: DrawnGeometry): GeoJSONStoreFeatures {
  if (g.shape === 'line') {
    return {
      type: 'Feature',
      id,
      properties: { mode: 'linestring' },
      geometry: { type: 'LineString', coordinates: g.coordinates.map(snapPair) },
    }
  }
  if (g.shape === 'polygon') {
    const ring = g.coordinates.map(snapPair)
    ring.push(ring[0])
    return {
      type: 'Feature',
      id,
      properties: { mode: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }
  }
  return {
    type: 'Feature',
    id,
    properties: { mode: 'point' },
    geometry: { type: 'Point', coordinates: snapPair(g.coordinates) },
  }
}

export function createDraw(map: MlMap, handlers: DrawHandlers): DrawController {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: DRAW_PRECISION }),
    idStrategy: {
      isValidId: (id) => typeof id === 'string' && id.length > 0,
      getId: () => newId('evt').replace('evt_', 'draw_'),
    },
    modes: [
      new TerraDrawLineStringMode({ styles: LINE_STYLE, editable: false }),
      new TerraDrawPolygonMode({ styles: POLY_STYLE, editable: false }),
      new TerraDrawPointMode({ styles: POINT_STYLE, editable: false }),
      new TerraDrawSelectMode({
        flags: {
          linestring: {
            feature: {
              draggable: false,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
          polygon: {
            feature: {
              // Draggable so an area can be shifted bodily onto the imagery, not only
              // reshaped corner by corner. Grabbing a corner still takes precedence.
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
          point: { feature: { draggable: true } },
        },
      }),
    ],
  })
  draw.start()
  // Handy in the browser console while developing; never present in a build.
  if (import.meta.env.DEV) (window as unknown as { __draw?: TerraDraw }).__draw = draw

  let editing = false
  let loaded: string[] = []

  draw.on('finish', (id, ctx) => {
    const f = draw.getSnapshotFeature(id)
    if (!f) return
    const g = fromStore(f)
    if (!g) return
    if (ctx.action === 'draw') {
      draw.removeFeatures([id])
      handlers.onDrawn(g)
      return
    }
    if (editing && typeof id === 'string' && loaded.includes(id)) handlers.onEdited(id, g)
  })

  draw.on('change', (ids, type) => {
    if (editing) {
      if (!handlers.onEditing || type !== 'update') return
      for (const id of ids) {
        if (typeof id !== 'string' || !loaded.includes(id)) continue
        const f = draw.getSnapshotFeature(id)
        const g = f ? fromStore(f) : null
        if (g) handlers.onEditing(id, g)
      }
      return
    }
    if (!handlers.onProvisional) return
    if (type === 'delete') {
      handlers.onProvisional(null)
      return
    }
    for (const id of ids) {
      const f = draw.getSnapshotFeature(id)
      if (!f || f.properties.mode !== draw.getMode()) continue
      const g = fromStore(f)
      if (g) handlers.onProvisional(g)
      return
    }
  })

  const clearLoaded = () => {
    const present = loaded.filter((id) => draw.hasFeature(id))
    if (present.length) draw.removeFeatures(present)
    loaded = []
  }

  return {
    setShape: (shape) => {
      if (editing) {
        editing = false
        clearLoaded()
      }
      draw.setMode(shape ? MODE[shape] : 'static')
    },
    ensureShape: (shape) => {
      if (editing || draw.getMode() === MODE[shape]) return false
      if (import.meta.env.DEV)
        console.warn(`Draw mode was ${draw.getMode()}; restoring ${MODE[shape]}`)
      draw.setMode(MODE[shape])
      return true
    },
    edit: (features) => {
      clearLoaded()
      editing = true
      draw.setMode('select')
      if (features.length) {
        // addFeatures reports each feature's validity and drops the invalid ones without
        // throwing. Only what it accepted is editable, so only that is worth tracking.
        const results = draw.addFeatures(features.map((f) => toStore(f.id, f.geometry)))
        const rejected = results.filter((r) => !r.valid)
        if (rejected.length) {
          handlers.onRejected?.(rejected.length, rejected[0]?.reason ?? 'unknown')
          if (import.meta.env.DEV) console.warn('Draw rejected features', rejected)
        }
        const ok = new Set(results.filter((r) => r.valid).map((r) => String(r.id)))
        loaded = features.map((f) => f.id).filter((id) => ok.has(id))
        // A single shape is what the user came to edit: show its corners right away.
        if (loaded.length === 1) {
          try {
            draw.selectFeature(loaded[0])
          } catch {
            // Selection is a convenience; the shape is still editable by clicking it.
          }
        }
      }
    },
    stopEditing: () => {
      editing = false
      clearLoaded()
      draw.setMode('static')
    },
    destroy: () => {
      try {
        draw.stop()
      } catch {
        // The map may already be gone.
      }
    },
  }
}
