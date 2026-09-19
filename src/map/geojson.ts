/** FarmState as the GeoJSON the map layers draw. */
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { FarmState, Ring, TreeStatus } from '@/model/types'
import { live } from '@/events/reduce'
import { currentTreeByPos, positions, varietyAt, varietyColors } from '@/state/derived'
import { DIM, blockVarietyColors, varietyColorsBySpecies } from '@/state/colors'

export type ColorBy = 'species' | 'variety' | 'status' | 'plan'

export const STATUS_COLOR: Record<TreeStatus, string> = {
  alive: '#a3e635',
  struggling: '#fbbf24',
  dead: '#78716c',
  removed: '#44403c',
}

export const EMPTY_COLOR = '#d6d3d1'

/** Close a ring for GeoJSON. */
export function closedRing(ring: Ring): [number, number][] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
  return closed.map(([lon, lat]) => [lon, lat])
}

const fc = <G extends Point | LineString | Polygon>(
  features: Feature<G>[],
): FeatureCollection<G> => ({
  type: 'FeatureCollection',
  features,
})

export function blocksFC(state: FarmState, hide: ReadonlySet<string> = new Set()) {
  const out: Feature<Polygon>[] = []
  for (const b of live.blocks(state)) {
    if (hide.has(b.id) || !b.outline || b.outline.length < 3) continue
    out.push({
      type: 'Feature',
      id: b.id,
      properties: { id: b.id, name: b.name, code: b.code, color: b.color ?? '#a3e635' },
      geometry: { type: 'Polygon', coordinates: [closedRing(b.outline)] },
    })
  }
  return fc(out)
}

/** Row lines, plus a labeled point at each row's start so numbering can be read on the map. */
export function rowsFC(state: FarmState, hide: ReadonlySet<string> = new Set()) {
  const out: Feature<LineString | Point>[] = []
  for (const r of live.rows(state)) {
    if (hide.has(r.id)) continue
    const block = state.blocks[r.blockId]
    const label = `${block?.code ?? ''}-${r.number}`
    const props = {
      id: r.id,
      blockId: r.blockId,
      number: r.number,
      label,
      color: block?.color ?? '#fef08a',
    }
    out.push({
      type: 'Feature',
      id: r.id,
      properties: props,
      geometry: { type: 'LineString', coordinates: r.polyline.map(([lon, lat]) => [lon, lat]) },
    })
    out.push({
      type: 'Feature',
      id: `${r.id}:label`,
      properties: props,
      geometry: { type: 'Point', coordinates: [r.polyline[0][0], r.polyline[0][1]] },
    })
  }
  return fc(out)
}

export interface PositionsOptions {
  colorBy: ColorBy
  /** Variety ids to light up; everything else goes grey. Empty means no highlight. */
  highlight?: ReadonlySet<string>
  planYear?: number
  hideRows?: ReadonlySet<string>
  hideBlocks?: ReadonlySet<string>
}

export function positionsFC(state: FarmState, opts: PositionsOptions) {
  const colors = varietyColors(state)
  const bySpecies = varietyColorsBySpecies(state)
  const perBlock = blockVarietyColors(state)
  const highlighting = (opts.highlight?.size ?? 0) > 0
  const trees = currentTreeByPos(state)
  const out: Feature<Point>[] = []
  for (const p of positions(state)) {
    if (p.rowId && opts.hideRows?.has(p.rowId)) continue
    if (opts.hideBlocks?.has(p.blockId)) continue
    const tree = trees.get(p.posKey)
    const variety = varietyAt(state, p)
    let color = EMPTY_COLOR
    if (highlighting) {
      color = variety && opts.highlight!.has(variety.id) ? (bySpecies.get(variety.id) ?? DIM) : DIM
    } else if (opts.colorBy === 'species')
      color = variety ? (bySpecies.get(variety.id) ?? EMPTY_COLOR) : EMPTY_COLOR
    else if (opts.colorBy === 'variety')
      color = variety ? (perBlock.get(p.blockId)?.get(variety.id) ?? EMPTY_COLOR) : EMPTY_COLOR
    else if (opts.colorBy === 'status') color = tree ? STATUS_COLOR[tree.status] : EMPTY_COLOR
    else if (opts.colorBy === 'plan') {
      const plan = state.plans[`${opts.planYear ?? new Date().getFullYear()}:${p.posKey}`]
      color = plan ? (colors.get(plan.varietyId) ?? '#fbbf24') : EMPTY_COLOR
    }
    out.push({
      type: 'Feature',
      id: p.posKey,
      properties: {
        posKey: p.posKey,
        label: p.label,
        blockId: p.blockId,
        rowId: p.rowId,
        color,
        empty: !tree,
        treeId: tree?.id ?? null,
        variety: variety?.name ?? null,
        status: tree?.status ?? null,
      },
      geometry: { type: 'Point', coordinates: [p.coord[0], p.coord[1]] },
    })
  }
  return fc(out)
}

export function planFC(state: FarmState, year: number, hideBlocks?: ReadonlySet<string>) {
  const colors = varietyColors(state)
  const byKey = new Map(positions(state).map((p) => [p.posKey, p]))
  const out: Feature<Point>[] = []
  for (const plan of Object.values(state.plans)) {
    if (plan.year !== year || plan.doneEventId) continue
    const p = byKey.get(plan.posKey)
    if (!p || hideBlocks?.has(p.blockId)) continue
    out.push({
      type: 'Feature',
      id: `plan:${plan.posKey}`,
      properties: {
        posKey: plan.posKey,
        label: p.label,
        color: colors.get(plan.varietyId) ?? '#fbbf24',
        variety: state.varieties[plan.varietyId]?.name ?? null,
      },
      geometry: { type: 'Point', coordinates: [p.coord[0], p.coord[1]] },
    })
  }
  return fc(out)
}

export function featuresFC(state: FarmState, hide: ReadonlySet<string> = new Set()) {
  const out: Feature<Point | Polygon>[] = []
  for (const f of live.features(state)) {
    if (hide.has(f.id)) continue
    const geometry: Point | Polygon =
      f.geometry.type === 'Point'
        ? { type: 'Point', coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]] }
        : { type: 'Polygon', coordinates: [closedRing(f.geometry.coordinates)] }
    out.push({
      type: 'Feature',
      id: f.id,
      properties: { id: f.id, name: f.name, kind: f.kind },
      geometry,
    })
  }
  return fc(out)
}
