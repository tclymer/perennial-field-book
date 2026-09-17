import type { Map as MlMap } from 'maplibre-gl'
import type { FarmState } from '@/model/types'
import { farmBounds } from '@/map/offline'

/** Fit the map to everything drawn, or to the farm's home view when nothing is drawn yet. */
export function goHome(map: MlMap, state: FarmState): void {
  const b = farmBounds(state)
  if (b) {
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 40, duration: 600, bearing: map.getBearing() },
    )
  } else if (state.farm) {
    map.easeTo({ center: state.farm.center, zoom: state.farm.zoom, duration: 600 })
  }
}

export function HomeButton({ map, state }: { map: MlMap | null; state: FarmState }) {
  return (
    <button
      type="button"
      title="Fit the whole farm"
      aria-label="Fit the whole farm"
      disabled={!map}
      onClick={() => map && goHome(map, state)}
      className="absolute left-2 top-2 z-10 rounded-md border border-stone-300 bg-white/95 px-2 py-1 text-xs font-medium text-stone-800 shadow hover:bg-stone-100 disabled:opacity-50"
    >
      ⌂ Farm
    </button>
  )
}
