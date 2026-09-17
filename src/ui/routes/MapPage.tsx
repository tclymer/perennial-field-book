import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Map as MlMap } from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { presetFor } from '@/map/presets'
import { useMapLayers } from '@/map/useMapLayers'
import { useMapPopup } from '@/map/useMapPopup'
import { useDraw, useHiddenShapes } from '@/map/useDraw'
import { initialView, useDevice, type MapView as View } from '@/state/device'
import { coordOfPosKey } from '@/state/derived'
import { useFarmStore } from '@/state/store'
import { BasemapNotice } from '@/ui/map/BasemapNotice'
import { EditorPanel } from '@/ui/map/EditorPanel'
import { useEditor } from '@/ui/map/editorStore'
import { useIsDesktop } from '@/ui/useIsDesktop'

export default function MapPage() {
  const prefs = useDevice()
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
    prefs.lastView ?? (farm ? { center: farm.center, zoom: farm.zoom, bearing: 0 } : initialView()),
  )
  const basemap = useMemo(
    () => presetFor(prefs, prefs.lastView?.center ?? start.current.center),
    [prefs],
  )
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

  return (
    <div className="absolute inset-0 flex">
      {isDesktop && <EditorPanel />}
      <div className="relative min-w-0 flex-1">
        <MapView
          className="absolute inset-0"
          initialView={start.current}
          basemap={basemap}
          onMap={onMap}
          onViewChange={(view) => {
            if (saveView.current) clearTimeout(saveView.current)
            saveView.current = setTimeout(() => setPrefs({ lastView: view }), 500)
          }}
        >
          {!basemap && (
            <BasemapNotice>
              No imagery selected.{' '}
              <Link to="/settings" className="underline decoration-dotted">
                Choose a source in Settings
              </Link>
              .
            </BasemapNotice>
          )}
        </MapView>
      </div>
    </div>
  )
}
