/** Keeps the map's GeoJSON sources in step with state and the editor's hidden shapes. */
import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { FarmState } from '@/model/types'
import { live } from '@/events/reduce'
import { blocksFC, featuresFC, planFC, positionsFC, rowsFC, type ColorBy } from './geojson'
import type { OverlaySource } from './style'

export interface HiddenShapes {
  blocks: ReadonlySet<string>
  rows: ReadonlySet<string>
  features: ReadonlySet<string>
  /** Hide the position dots of these blocks (while their trees are being dragged). */
  positionsOfBlocks: ReadonlySet<string>
}

export const NOTHING_HIDDEN: HiddenShapes = {
  blocks: new Set(),
  rows: new Set(),
  features: new Set(),
  positionsOfBlocks: new Set(),
}

function setData(map: MlMap, id: OverlaySource, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  src?.setData(data)
}

export function useMapLayers(
  map: MlMap | null,
  state: FarmState,
  colorBy: ColorBy,
  planYear: number,
  hidden: HiddenShapes = NOTHING_HIDDEN,
): void {
  const data = useMemo(() => {
    const positions = positionsFC(state, {
      colorBy,
      planYear,
      hideRows: hidden.rows,
      hideBlocks: hidden.positionsOfBlocks,
    })
    return {
      blocks: blocksFC(state, hidden.blocks),
      rows: rowsFC(state, hidden.rows),
      features: featuresFC(state, hidden.features),
      positions,
      labels: positions,
      plan: planFC(state, planYear, hidden.positionsOfBlocks),
    }
  }, [state, colorBy, planYear, hidden])

  useEffect(() => {
    if (!map) return
    for (const [id, fc] of Object.entries(data)) setData(map, id as OverlaySource, fc)
  }, [map, data])
}

/** The shapes of one block, for loading into the editor. */
export function blockShapes(state: FarmState, blockId: string) {
  return {
    rows: live.rows(state).filter((r) => r.blockId === blockId),
    loose: live.loosePositions(state).filter((p) => p.blockId === blockId),
    outline: state.blocks[blockId]?.outline ?? null,
  }
}
