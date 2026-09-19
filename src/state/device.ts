/**
 * Per-device settings that belong to this browser rather than to the farm: which imagery
 * to show, whether Google is on, and where the map was last left. Kept in localStorage.
 */
import { create } from 'zustand'
import type { PresetId } from '@/map/presets'

export interface CustomTiles {
  url: string
  maxzoom: number
  attribution: string
}

export interface MapView {
  center: [number, number]
  zoom: number
  bearing: number
}

export interface OfflineMap {
  presetId: string
  presetName: string
  vintage: string | null
  savedAt: number
  tiles: number
}

export interface DevicePrefs {
  /** A preset id, 'none', 'custom', or null for "pick by location". */
  basemap: PresetId | 'none' | 'custom' | null
  customTiles: CustomTiles | null
  googleEnabled: boolean
  lastView: MapView | null
  /** What "Save map for offline" last kept, if anything. */
  offlineMap: OfflineMap | null
  /** Who uses this device, for work logs. */
  personId: string | null
}

const PREFS_KEY = 'fieldbook:device'
const DEVICE_KEY = 'fieldbook:deviceId'

const DEFAULTS: DevicePrefs = {
  basemap: null,
  customTiles: null,
  googleEnabled: true,
  lastView: null,
  offlineMap: null,
  personId: null,
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-')
}

let cachedDeviceId: string | null = null

/** A stable id for this browser, created on first use. */
export function deviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return (cachedDeviceId = stored)
    const fresh = randomId()
    localStorage.setItem(DEVICE_KEY, fresh)
    return (cachedDeviceId = fresh)
  } catch {
    return (cachedDeviceId = randomId())
  }
}

function readPrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<DevicePrefs>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function writePrefs(prefs: DevicePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage may be unavailable; the choice then lasts for this page only.
  }
}

interface DeviceStore extends DevicePrefs {
  set: (patch: Partial<DevicePrefs>) => void
}

function pick(s: DeviceStore): DevicePrefs {
  return {
    basemap: s.basemap,
    customTiles: s.customTiles,
    googleEnabled: s.googleEnabled,
    lastView: s.lastView,
    offlineMap: s.offlineMap,
    personId: s.personId,
  }
}

export const useDevice = create<DeviceStore>()((set, get) => ({
  ...readPrefs(),
  set: (patch) => {
    set(patch)
    writePrefs(pick(get()))
  },
}))

/** Where a new map opens: the last view, the development center, or the continental US. */
export function initialView(): MapView {
  const last = useDevice.getState().lastView
  if (last) return last
  const dev = import.meta.env.VITE_DEV_CENTER
  if (dev) {
    const [lat, lon] = dev.split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { center: [lon, lat], zoom: 17, bearing: 0 }
    }
  }
  return { center: [-98.5, 39.8], zoom: 4, bearing: 0 }
}
