/**
 * The materialized state of a farm: what the event log adds up to. Plain JSON throughout.
 * See DESIGN.md §3 for the domain model and §8.2 for how events become this state.
 */

export type LngLat = [lon: number, lat: number]
/** Two or more vertices; a row with a turn has a vertex at the turn. */
export type Polyline = LngLat[]
/** Three or more vertices, not repeated at the end; closed when exported as GeoJSON. */
export type Ring = LngLat[]

export type CompassSide = 'N' | 'S' | 'E' | 'W'

/** How rows and positions are numbered within a block, shown on every tree page. */
export interface Numbering {
  /** Rows count up starting from this side of the block. */
  rowsFrom: CompassSide
  /** Where position 1 is, in words: "the road end", "the north end". */
  positionsFrom: string
}

/** The link to a planting in the Perennial Profit Planner, with the numbers it carried. */
export interface PlannerLink {
  plantingId: string
  name?: string
  rowLengthFt?: number
  rowWidthFt?: number
  inRowSpacingFt?: number
  rows?: number
  unit?: string
  plantedYear?: number
}

interface Stamped {
  createdAt: number
  updatedAt: number
  /** A tombstone: kept for restore, hidden everywhere else. */
  deleted?: boolean
}

/** How a block's rows were generated from its outline, kept so a reshaped outline can refill. */
export interface FillParams {
  headingDeg: number
  rowSpacingFt: number
  treeSpacingFt: number
  insetFt: number
  insetEndFt?: number
  shiftAlongFt?: number
  shiftAcrossFt?: number
  pattern: 'square' | 'diamond'
}

export interface Block extends Stamped {
  id: string
  /** Short code that starts every tree label: PP1, PER, Y. Letters and digits only. */
  code: string
  name: string
  numbering: Numbering
  species?: string
  rowSpacingFt?: number
  inRowSpacingFt?: number
  notes?: string
  planner?: PlannerLink
  outline?: Ring
  fill?: FillParams
  color?: string
}

export type RowLayout = { by: 'count'; count: number } | { by: 'spacing'; spacingFt: number }

export interface Row extends Stamped {
  id: string
  blockId: string
  number: number
  /** Drawn from position 1 to the last position. */
  polyline: Polyline
  layout: RowLayout
  /** Trees in this row inherit it unless they say otherwise. */
  defaultVarietyId?: string
  notes?: string
}

/** A position that is not on a row: a yard tree, a trial spot. Its posKey is its id. */
export interface LoosePosition extends Stamped {
  id: string
  blockId: string
  number: number
  coord: LngLat
}

export type FeatureKind = 'building' | 'greenhouse' | 'area' | 'fence' | 'windbreak' | 'other'

export type FeatureGeometry =
  { type: 'Point'; coordinates: LngLat } | { type: 'Polygon'; coordinates: Ring }

/** A barn, greenhouse, area, or fence line: a landmark and a place work can point at. */
export interface Feature extends Stamped {
  id: string
  name: string
  kind: FeatureKind
  geometry: FeatureGeometry
  notes?: string
}

export interface Variety extends Stamped {
  id: string
  species: string
  name: string
  aliases: string[]
  /** Where the scionwood or the trees came from. */
  source?: string
  notes?: string
  color?: string
}

export type TreeStatus = 'alive' | 'struggling' | 'dead' | 'removed'

export interface Tree extends Stamped {
  id: string
  /** Row position `${rowId}:${index}` or a loose position id. */
  posKey: string
  varietyId?: string
  status: TreeStatus
  plantedDate?: string
  graftedDate?: string
  firstFruitYear?: number
  rootstock?: string
  notes?: string
}

export type TreeEventKind =
  'planted' | 'grafted' | 'fruited' | 'died' | 'removed' | 'scionwood' | 'note' | 'photo' | 'status'

export interface TreeEvent {
  id: string
  treeId: string
  kind: TreeEventKind
  /** ISO date, YYYY-MM-DD. */
  date: string
  varietyId?: string
  status?: TreeStatus
  note?: string
  photoId?: string
  createdAt: number
  deleted?: boolean
}

export interface GraftPlan {
  year: number
  posKey: string
  varietyId: string
  /** Set when the graft was done and converted to a tree event. */
  doneEventId?: string
}

export interface FarmMeta {
  id: string
  name: string
  center: LngLat
  zoom: number
  createdAt: number
}

export interface FarmState {
  farm: FarmMeta | null
  blocks: Record<string, Block>
  rows: Record<string, Row>
  loosePositions: Record<string, LoosePosition>
  features: Record<string, Feature>
  varieties: Record<string, Variety>
  trees: Record<string, Tree>
  treeEvents: Record<string, TreeEvent>
  /** Position coordinate overrides by posKey. */
  nudges: Record<string, LngLat>
  /** Graft plans keyed `${year}:${posKey}`. */
  plans: Record<string, GraftPlan>
  /** Number of events applied and the timestamp of the last one. */
  applied: number
  lastTs: number
}

export type EntityKind = 'block' | 'row' | 'position' | 'feature' | 'variety' | 'tree'

export function planKey(year: number, posKey: string): string {
  return `${year}:${posKey}`
}
