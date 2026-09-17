/**
 * Tile URLs the service worker may store for offline use: public imagery published for
 * unrestricted use. Google is deliberately absent; its terms forbid caching (DESIGN.md §8.1).
 * Imported by vite.config.ts for the workbox rule and by the offline saver.
 */
export const CACHEABLE_TILE_RE =
  /^https:\/\/(apps\.pasda\.psu\.edu|basemap\.nationalmap\.gov)\/arcgis\/rest\/services\/[^?]+\/tile\/\d+\/\d+\/\d+$/

export const TILE_CACHE_NAME = 'basemap-tiles'
