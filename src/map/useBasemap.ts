/**
 * Chooses the basemap for the map page: Google through the Map Tiles API when a key is
 * present, the device allows it, and the browser is online; otherwise the free preset. Falls
 * back on quota or errors and reports a notice. Google tiles are never cached by the app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useDevice } from '@/state/device'
import { presetFor, type BasemapSpec, type LngLat } from './presets'
import {
  initialState,
  onAvailability,
  onGoogleFailure,
  onSessionFailure,
  retryGoogle,
  type Availability,
  type BasemapState,
} from './basemap'
import { clearSession, fetchViewport, getSession, tileUrlTemplate } from './google'

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? ''

function simulateStatus(): number | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('simulateGoogle')
  return v ? Number(v) : null
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export interface BasemapChoice {
  spec: BasemapSpec | null
  state: BasemapState
  /** Google's attribution text for the current view, when Google is showing. */
  copyright: string | null
  onSourceError: (sourceId: string | undefined, status: number | undefined) => void
  retry: () => void
  hasKey: boolean
}

export function useBasemap(map: MlMap | null, center: LngLat): BasemapChoice {
  const prefs = useDevice()
  const online = useOnline()
  const preset = useMemo(() => presetFor(prefs, center), [prefs, center])
  const availability: Availability = useMemo(
    () => ({
      hasKey: Boolean(KEY),
      enabled: prefs.googleEnabled,
      online,
      hasPreset: Boolean(preset),
      presetName: preset?.name ?? null,
    }),
    [prefs.googleEnabled, online, preset],
  )
  const [state, setState] = useState<BasemapState>(() => initialState(availability))
  const [template, setTemplate] = useState<string | null>(null)
  const [copyright, setCopyright] = useState<string | null>(null)
  const avail = useRef(availability)
  avail.current = availability

  useEffect(() => {
    setState((s) => onAvailability(s, availability))
  }, [availability])

  // Start (or reuse) a Google session whenever Google is the chosen source.
  useEffect(() => {
    if (state.source !== 'google' || !KEY) {
      setTemplate(null)
      return
    }
    let live = true
    const sim = simulateStatus()
    void getSession(KEY)
      .then((s) => {
        if (!live) return
        setTemplate(tileUrlTemplate(KEY, s.session))
        if (sim)
          setTimeout(() => live && setState((st) => onGoogleFailure(st, sim, avail.current)), 1500)
      })
      .catch((err: Error & { status?: number }) => {
        if (!live) return
        clearSession()
        setState((st) => onSessionFailure(st, err.status, avail.current))
      })
    return () => {
      live = false
    }
  }, [state.source])

  // Attribution text follows the view while Google is showing.
  useEffect(() => {
    if (!map || state.source !== 'google' || !template) {
      setCopyright(null)
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let live = true
    const update = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const b = map.getBounds()
          const s = await getSession(KEY)
          const v = await fetchViewport(
            KEY,
            s.session,
            [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            map.getZoom(),
          )
          if (live) setCopyright(v.copyright)
        } catch {
          if (live) setCopyright('Google')
        }
      }, 500)
    }
    update()
    map.on('moveend', update)
    return () => {
      live = false
      if (timer) clearTimeout(timer)
      map.off('moveend', update)
    }
  }, [map, state.source, template])

  const spec: BasemapSpec | null = useMemo(() => {
    if (state.source === 'google') {
      if (!template) return preset
      return {
        id: 'google',
        name: 'Google satellite',
        tiles: [template],
        maxzoom: 22,
        attribution: 'Google',
        cacheable: false,
      }
    }
    return state.source === 'preset' ? preset : null
  }, [state.source, template, preset])

  const onSourceError = useCallback((sourceId: string | undefined, status: number | undefined) => {
    if (sourceId !== 'basemap') return
    setState((st) => onGoogleFailure(st, status, avail.current))
  }, [])

  const retry = useCallback(() => {
    clearSession()
    setState(retryGoogle(avail.current))
  }, [])

  return { spec, state, copyright, onSourceError, retry, hasKey: Boolean(KEY) }
}
