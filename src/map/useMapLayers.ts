/** Keeps the map's GeoJSON sources in step with state and the editor's hidden shapes. */
import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { FarmState, Row } from '@/model/types'
import { live } from '@/events/reduce'
import { fillOutline } from '@/engine/fill'
import { autoNumberRows } from '@/engine/layout'
import { positionsAlong } from '@/engine/geo'
import { blocksFC, featuresFC, planFC, positionsFC, rowsFC, type ColorBy } from './geojson'
import type { OverlaySource } from './style'
import { useEditor } from '@/ui/map/editorStore'

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

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

function setData(map: MlMap, id: OverlaySource, data: FeatureCollection) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  src?.setData(data)
}

/** The rows and trees a fill would create, drawn as a preview while the form is open. */
export function fillPreviewFC(state: FarmState): FeatureCollection {
  const fill = useEditor.getState().fill
  if (!fill) return EMPTY
  const block = state.blocks[fill.blockId]
  const outline = fill.drawing ? fill.previewOutline : block?.outline
  if (!outline || outline.length < 3) return EMPTY
  const rows = fillOutline(outline, {
    headingDeg: fill.headingDeg + fill.rotateDeg,
    rowSpacingFt: fill.rowSpacingFt,
    treeSpacingFt: fill.treeSpacingFt,
    insetFt: fill.insetFt,
    pattern: fill.pattern,
  })
  // Number the preview the way the fill will, so the labels can be checked first.
  const order = autoNumberRows(
    rows.map((r, i) => ({ id: String(i), polyline: r.polyline }) as Row),
    block?.numbering.rowsFrom ?? 'W',
  )
  const numberOf = new Map(order.map((o) => [Number(o.id), o.number]))
  const features: Feature<LineString | Point>[] = []
  rows.forEach((r, i) => {
    features.push({
      type: 'Feature',
      id: `pr-${i}`,
      properties: {},
      geometry: { type: 'LineString', coordinates: r.polyline.map(([a, b]) => [a, b]) },
    })
    features.push({
      type: 'Feature',
      properties: { label: `${block?.code ?? ''}-${numberOf.get(i) ?? i + 1}` },
      geometry: { type: 'Point', coordinates: [r.polyline[0][0], r.polyline[0][1]] },
    })
    for (const c of positionsAlong(r.polyline, { by: 'count', count: r.count })) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [c[0], c[1]] },
      })
    }
  })
  return { type: 'FeatureCollection', features }
}

export function useMapLayers(
  map: MlMap | null,
  state: FarmState,
  colorBy: ColorBy,
  planYear: number,
  hidden: HiddenShapes = NOTHING_HIDDEN,
): void {
  const fill = useEditor((s) => s.fill)
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
      preview: fill ? fillPreviewFC(state) : EMPTY,
    }
  }, [state, colorBy, planYear, hidden, fill])

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
