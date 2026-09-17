/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface ImportMetaEnv {
  /** Google Map Tiles API key. Absent in development unless set in .env.local. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
  /** "lat,lon" to center a fresh farm on during development. */
  readonly VITE_DEV_CENTER?: string
}
