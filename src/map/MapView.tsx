import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapView as View } from '@/state/device'
import type { BasemapSpec } from './presets'
import {
  BASEMAP_LAYER,
  BASEMAP_SOURCE,
  FIRST_OVERLAY_LAYER,
  buildStyle,
  rasterSource,
} from './style'

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Swap the raster basemap without touching the overlay layers. */
export function setBasemap(map: MlMap, spec: BasemapSpec | null): void {
  if (map.getLayer(BASEMAP_LAYER)) map.removeLayer(BASEMAP_LAYER)
  if (map.getSource(BASEMAP_SOURCE)) map.removeSource(BASEMAP_SOURCE)
  if (!spec) return
  map.addSource(BASEMAP_SOURCE, rasterSource(spec))
  map.addLayer(
    { id: BASEMAP_LAYER, type: 'raster', source: BASEMAP_SOURCE },
    map.getLayer(FIRST_OVERLAY_LAYER) ? FIRST_OVERLAY_LAYER : undefined,
  )
}

export interface MapViewProps {
  /** Where the map opens. Later moves are reported through `onViewChange`, not driven by props. */
  initialView: View
  basemap: BasemapSpec | null
  onViewChange?: (view: View) => void
  /** Called with the map once it is ready, and with null when it is torn down. */
  onMap?: (map: MlMap | null) => void
  /** Called for tile and style errors, with the HTTP status when there is one. */
  onSourceError?: (sourceId: string | undefined, status: number | undefined) => void
  className?: string
  children?: ReactNode
}

/**
 * The MapLibre map as a React component. Creates the map once, swaps the basemap when the
 * prop changes, and renders a placeholder where WebGL is missing so pages never crash.
 */
export function MapView({
  initialView,
  basemap,
  onViewChange,
  onMap,
  onSourceError,
  className,
  children,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [supported] = useState(hasWebGL)
  const [ready, setReady] = useState(false)
  const latest = useRef({ onViewChange, onMap, onSourceError, basemap, initialView })
  latest.current = { onViewChange, onMap, onSourceError, basemap, initialView }

  useEffect(() => {
    if (!supported || !container.current) return
    let disposed = false
    let map: MlMap | null = null
    void (async () => {
      // Loaded on demand so pages and tests without WebGL never import the library.
      const maplibregl = await import('maplibre-gl')
      if (disposed || !container.current) return
      const { basemap: spec, initialView: view } = latest.current
      map = new maplibregl.Map({
        container: container.current,
        style: buildStyle(spec),
        center: view.center,
        zoom: view.zoom,
        bearing: view.bearing,
        maxPitch: 0,
        pitchWithRotate: false,
        attributionControl: false,
        maxZoom: 22,
      })
      map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right')
      map.addControl(
        new maplibregl.NavigationControl({
          showZoom: true,
          showCompass: true,
          visualizePitch: false,
        }),
        'top-right',
      )
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showAccuracyCircle: true,
        }),
        'top-right',
      )
      map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')
      map.on('moveend', () => {
        if (!map) return
        const c = map.getCenter()
        latest.current.onViewChange?.({
          center: [c.lng, c.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
        })
      })
      map.on('error', (e) => {
        const err = e.error as { status?: number } | undefined
        const sourceId = (e as { sourceId?: string }).sourceId
        latest.current.onSourceError?.(sourceId, err?.status)
      })
      map.once('load', () => {
        if (disposed) return
        mapRef.current = map
        setReady(true)
        latest.current.onMap?.(map)
      })
      // Handy in the browser console while developing; never present in a build.
      if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map
    })()
    return () => {
      disposed = true
      latest.current.onMap?.(null)
      mapRef.current = null
      map?.remove()
    }
  }, [supported])

  // The basemap prop can change after load (a setting, or a fallback).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setBasemap(map, basemap)
  }, [basemap, ready])

  // Keep the canvas sized to its box, which changes with the phone tab bar and rotations.
  useEffect(() => {
    const el = container.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => mapRef.current?.resize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!supported) {
    return (
      <div
        className={className}
        role="img"
        aria-label="Map unavailable"
        data-testid="map-placeholder"
      >
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-stone-500 dark:text-stone-400">
          This browser cannot draw the map. Blocks, trees, and search still work.
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* MapLibre's own stylesheet makes the container position: relative, so size it by percent. */}
      <div ref={container} className="h-full w-full" />
      {children}
    </div>
  )
}
