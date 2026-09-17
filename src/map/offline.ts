/**
 * "Save map for offline": fetch the free preset's tiles over the farm into the same cache
 * the service worker serves from, so the field map works without signal. Only sources whose
 * terms allow it (DESIGN.md §8.1); Google is refused here by construction.
 */
import type { FarmState } from '@/model/types'
import { live } from '@/events/reduce'
import { positions } from '@/state/derived'
import { bboxOf, padBounds, tilesForBounds, type Bounds, type TileId } from '@/engine/geo'
import { CACHEABLE_TILE_RE, TILE_CACHE_NAME } from './cacheable'
import type { BasemapSpec } from './presets'

const MIN_ZOOM = 14
const MARGIN_FT = 400

/** Everything drawn so far, padded, or null when nothing is drawn yet. */
export function farmBounds(state: FarmState): Bounds | null {
  const pts = positions(state).map((p) => p.coord)
  for (const r of live.rows(state)) pts.push(...r.polyline)
  for (const f of live.features(state)) {
    if (f.geometry.type === 'Point') pts.push(f.geometry.coordinates)
    else pts.push(...f.geometry.coordinates)
  }
  for (const b of live.blocks(state)) if (b.outline) pts.push(...b.outline)
  if (pts.length === 0) return null
  return padBounds(bboxOf(pts), MARGIN_FT)
}

export function tileUrl(spec: BasemapSpec, t: TileId): string {
  return spec.tiles[0]
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
}

/** The tiles a save would fetch, and whether the source may be saved at all. */
export function plannedTiles(
  state: FarmState,
  spec: BasemapSpec | null,
): { ok: true; tiles: TileId[]; bounds: Bounds } | { ok: false; reason: string } {
  if (!spec) return { ok: false, reason: 'No free imagery source is selected.' }
  if (!spec.cacheable) {
    return { ok: false, reason: `${spec.name} may not be stored for offline use.` }
  }
  const bounds = farmBounds(state)
  if (!bounds) return { ok: false, reason: 'Draw the farm first so there is an area to save.' }
  const tiles = tilesForBounds(bounds, MIN_ZOOM, spec.maxzoom)
  return { ok: true, tiles, bounds }
}

export interface SaveProgress {
  done: number
  total: number
  failed: number
}

/** Fetch every planned tile into the tile cache. Resolves with the final tally. */
export async function saveMapForOffline(
  spec: BasemapSpec,
  tiles: TileId[],
  onProgress?: (p: SaveProgress) => void,
  concurrency = 6,
): Promise<SaveProgress> {
  if (typeof caches === 'undefined') throw new Error('This browser cannot store map tiles.')
  const cache = await caches.open(TILE_CACHE_NAME)
  const progress: SaveProgress = { done: 0, total: tiles.length, failed: 0 }
  let next = 0
  const worker = async () => {
    while (next < tiles.length) {
      const t = tiles[next++]
      const url = tileUrl(spec, t)
      if (!CACHEABLE_TILE_RE.test(url)) {
        progress.failed += 1
      } else {
        try {
          const hit = await cache.match(url)
          if (!hit) {
            const res = await fetch(url)
            if (res.ok) await cache.put(url, res)
            else progress.failed += 1
          }
        } catch {
          progress.failed += 1
        }
      }
      progress.done += 1
      onProgress?.({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker))
  return progress
}

/** How many of the planned tiles are already in the cache. */
export async function cachedCount(spec: BasemapSpec, tiles: TileId[]): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const cache = await caches.open(TILE_CACHE_NAME)
  let n = 0
  for (const t of tiles) if (await cache.match(tileUrl(spec, t))) n += 1
  return n
}

export async function clearOfflineTiles(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(TILE_CACHE_NAME)
}
