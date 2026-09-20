import { useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Map as MlMap } from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { useBasemap } from '@/map/useBasemap'
import { useMapLayers } from '@/map/useMapLayers'
import { useMapPopup } from '@/map/useMapPopup'
import { useDraw, useHiddenShapes } from '@/map/useDraw'
import { initialView, useDevice, type MapView as View } from '@/state/device'
import { coordOfPosKey } from '@/state/derived'
import { useFarmStore } from '@/state/store'
import { BasemapNotice } from '@/ui/map/BasemapNotice'
import { EditorPanel } from '@/ui/map/EditorPanel'
import { GoogleAttribution } from '@/ui/map/GoogleAttribution'
import { HomeButton, goHome } from '@/ui/map/HomeButton'
import { HighlightBar } from '@/ui/map/HighlightBar'
import { coordsOfVarieties } from '@/state/colors'
import { bboxOf, padBounds } from '@/engine/geo'
import { flyToFeature } from '@/map/bounds'
import { useEditor } from '@/ui/map/editorStore'
import { useIsDesktop } from '@/ui/useIsDesktop'

export default function MapPage() {
  const lastView = useDevice((s) => s.lastView)
  const setPrefs = useDevice((s) => s.set)
  const farm = useFarmStore((s) => s.state.farm)
  const state = useFarmStore((s) => s.state)
  const isDesktop = useIsDesktop()
  const map = useEditor((s) => s.map)
  const setMap = useEditor((s) => s.setMap)
  const colorBy = useEditor((s) => s.colorBy)
  const planYear = useEditor((s) => s.planYear)
  const hidden = useHiddenShapes(state)
  // Read once: the map owns its view after that and reports moves back.
  const start = useRef<View>(
    lastView ?? (farm ? { center: farm.center, zoom: farm.zoom, bearing: 0 } : initialView()),
  )
  const basemap = useBasemap(map, start.current.center)
  const saveView = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMap = useCallback((m: MlMap | null) => setMap(m), [setMap])

  useMapLayers(map, state, colorBy, planYear, hidden)
  useDraw(map, state, isDesktop)
  useMapPopup(map)

  // "Show on map" from a tree page: fly to the position once the map is up.
  const [params] = useSearchParams()
  const focus = params.get('focus')
  useEffect(() => {
    if (!map || !focus) return
    const coord = coordOfPosKey(useFarmStore.getState().state, focus)
    if (coord) map.easeTo({ center: coord, zoom: Math.max(map.getZoom(), 20), duration: 800 })
  }, [map, focus])

  // A tag paired to a building or area: show it.
  const featureParam = params.get('feature')
  useEffect(() => {
    if (!map || !featureParam) return
    flyToFeature(map, useFarmStore.getState().state, featureParam)
  }, [map, featureParam])

  // "Show on map" from the varieties page or search: light the variety up and fit to it.
  const highlightParam = params.get('highlight')
  const setHighlight = useEditor((s) => s.setHighlight)
  useEffect(() => {
    if (!highlightParam) return
    const ids = highlightParam.split(',').filter(Boolean)
    setHighlight(ids)
    if (!map) return
    const coords = coordsOfVarieties(useFarmStore.getState().state, new Set(ids))
    if (coords.length) {
      map.fitBounds(padBounds(bboxOf(coords), 0.15), { padding: 40, duration: 800, maxZoom: 20 })
    }
  }, [map, highlightParam, setHighlight])

  // First open on this device: fit to whatever has been drawn rather than a remembered view.
  useEffect(() => {
    if (!map || focus || featureParam || highlightParam || lastView) return
    goHome(map, useFarmStore.getState().state)
    // Only once, when the map first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  const showingGoogle = basemap.state.source === 'google' && basemap.spec?.id === 'google'

  return (
    <div className="absolute inset-0 flex">
      {isDesktop && <EditorPanel />}
      <div className="relative min-w-0 flex-1">
        <MapView
          className="absolute inset-0"
          initialView={start.current}
          basemap={basemap.spec}
          onMap={onMap}
          onSourceError={basemap.onSourceError}
          onViewChange={(view) => {
            if (saveView.current) clearTimeout(saveView.current)
            saveView.current = setTimeout(() => setPrefs({ lastView: view }), 500)
          }}
        >
          {basemap.state.notice ? (
            <BasemapNotice>
              {basemap.state.notice}{' '}
              <button className="underline decoration-dotted" onClick={basemap.retry}>
                Try Google again
              </button>
            </BasemapNotice>
          ) : (
            !basemap.spec && (
              <BasemapNotice>
                No imagery selected.{' '}
                <Link to="/settings" className="underline decoration-dotted">
                  Choose a source in Settings
                </Link>
                .
              </BasemapNotice>
            )
          )}
          {showingGoogle && <GoogleAttribution copyright={basemap.copyright} />}
          <HomeButton map={map} state={state} />
          <HighlightBar className="absolute left-2 top-2 z-10 max-w-[calc(100%-6rem)]" />
        </MapView>
      </div>
    </div>
  )
}
