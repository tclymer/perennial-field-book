/** Where a block is on the ground, for flying the map to it. */
import type { Map as MlMap } from 'maplibre-gl'
import type { FarmState, LngLat } from '@/model/types'
import { live } from '@/events/reduce'
import { bboxOf, padBounds } from '@/engine/geo'
import { positions } from '@/state/derived'

/** Every coordinate a block occupies: its outline, its rows, and its trees. */
export function blockCoords(state: FarmState, blockId: string): LngLat[] {
  const block = state.blocks[blockId]
  if (!block || block.deleted) return []
  const out: LngLat[] = []
  if (block.outline?.length) out.push(...block.outline)
  for (const r of live.rows(state)) if (r.blockId === blockId) out.push(...r.polyline)
  for (const p of positions(state)) if (p.blockId === blockId) out.push(p.coord)
  return out
}

/** Fly to a block. False when nothing has been drawn for it yet. */
export function flyToBlock(map: MlMap, state: FarmState, blockId: string): boolean {
  const coords = blockCoords(state, blockId)
  if (coords.length === 0) return false
  const [w, s, e, n] = padBounds(bboxOf(coords), 30)
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 60, duration: 600, maxZoom: 20, bearing: map.getBearing() },
  )
  return true
}
