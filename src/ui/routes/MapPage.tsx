import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MapView } from '@/map/MapView'
import { presetFor } from '@/map/presets'
import { initialView, useDevice, type MapView as View } from '@/state/device'
import { BasemapNotice } from '@/ui/map/BasemapNotice'

export default function MapPage() {
  const prefs = useDevice()
  const setPrefs = useDevice((s) => s.set)
  // Read once: the map owns its view after that and reports moves back.
  const start = useRef<View>(initialView())
  const basemap = useMemo(
    () => presetFor(prefs, prefs.lastView?.center ?? start.current.center),
    [prefs],
  )
  const saveView = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <MapView
      className="absolute inset-0"
      initialView={start.current}
      basemap={basemap}
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
  )
}
