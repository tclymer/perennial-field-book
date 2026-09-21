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

/** Planted blocks are real: every position is a tree. Planned ones are layouts only. */
export type BlockStatus = 'planted' | 'planned'

export interface Block extends Stamped {
  id: string
  /** Short code that starts every tree label: PP1, PER, Y. Letters and digits only. */
  code: string
  name: string
  numbering: Numbering
  /** Absent means planted. */
  status?: BlockStatus
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
  /**
   * Slots the row generates but that hold nothing: a spot thinned out, or one skipped for
   * rocky ground. The slot stays so no key moves; it is simply left out of the numbering,
   * so the trees that remain count one upward with no gap.
   */
  skips?: number[]
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
  /** A few words shown beside the name on the map: "seed starting", "tools and fuel". */
  description?: string
  notes?: string
}

export interface Variety extends Stamped {
  id: string
  species: string
  name: string
  /** A type within the species, e.g. Asian, American, or Hybrid for persimmons. */
  group?: string
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

/** Task buckets (DESIGN.md §3.3). The default labels are Threefold's Keep headings. */
export type Bucket = 'now' | 'soon' | 'later' | 'recurring' | 'project'

export const BUCKETS: readonly Bucket[] = ['now', 'soon', 'later', 'recurring', 'project']

export const DEFAULT_BUCKET_NAMES: Record<Bucket, string> = {
  now: 'Monkeys',
  soon: 'Mini Tasks/Projects',
  later: 'Long Term',
  recurring: 'Spinning Plates',
  project: 'Projects',
}

/** What a task or a log points at: a place, a tree, the whole farm, or nothing. */
export type Target =
  | { kind: 'block'; id: string }
  | { kind: 'row'; id: string }
  | { kind: 'feature'; id: string }
  | { kind: 'tree'; posKey: string }
  /** Every block of a crop, including ones added later. */
  | { kind: 'species'; species: string }
  | { kind: 'farm' }

/** Short descriptions of what each bucket is for, shown under the list names. */
export const BUCKET_HINTS: Record<Bucket, string> = {
  now: 'What is on the plate this week.',
  soon: 'Small jobs and projects for when there is a gap.',
  later: 'Undated wishes; a season tag brings them forward.',
  recurring: 'Things to keep up with, sorted by how long since last done.',
  project: 'Bigger pieces of work with their own subtasks.',
}

export interface Person extends Stamped {
  id: string
  name: string
  active: boolean
  /** Set when the person was created from a Google sign-in, so devices match them again. */
  email?: string
}

export interface Task extends Stamped {
  id: string
  title: string
  bucket: Bucket
  /** Parent project (a task with bucket 'project'); the child's own bucket is then ignored. */
  projectId?: string
  targets: Target[]
  category?: string
  ownerId?: string
  needsDiscussion?: boolean
  /** Free text such as "late fall"; `seasonMonths` is its machine form, 1 to 12. */
  season?: string
  seasonMonths?: number[]
  /** Recurring: an optional interval that only adds a "due" hint. */
  intervalDays?: number
  /** Default log duration; a recurring task with one logs on a single tap. */
  estimatedMinutes?: number
  notes?: string
  /** One-off tasks only; a recurring task's "last done" comes from its logs. */
  done?: boolean
  doneAt?: string
  /** Position within its bucket or project. */
  order: number
}

export interface Material {
  product: string
  rate?: string
  amount?: number
  unit?: string
  lot?: string
}

export interface WorkLog extends Stamped {
  id: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  personIds: string[]
  durationMinutes?: number
  category?: string
  targets: Target[]
  taskId?: string
  materials?: Material[]
  notes?: string
}

/** One box (or one tree's picking) of one crop on one day (DESIGN.md §3.6). */
export interface Harvest extends Stamped {
  id: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** The species word, lower case, as on blocks and varieties. */
  crop: string
  /** Absent means mixed or unknown. */
  varietyId?: string
  /** Where it was picked: a block, or a greenhouse feature. */
  blockId?: string
  featureId?: string
  /** A per-tree entry, for trial blocks and tags. */
  posKey?: string
  /** Net weight or count for this box, in `unit`. */
  quantity: number
  unit: string
  /** The number written on the box: nth entry of this crop that day. */
  box?: number
  personIds?: string[]
  notes?: string
}

export interface FarmMeta {
  id: string
  name: string
  center: LngLat
  zoom: number
  createdAt: number
  /**
   * Units per crop, the usual one first. A string is the older single-unit shape and still
   * reads correctly; see `unitsFor`.
   */
  units?: Record<string, string | string[]>
  /** Chosen colour per crop, keyed by lower-case species name; overrides the fruit default. */
  speciesColors?: Record<string, string>
  /** Renamed buckets; absent ones use DEFAULT_BUCKET_NAMES. */
  bucketNames?: Partial<Record<Bucket, string>>
  /** Categories this farm added beyond the standard list. */
  categories?: string[]
  /** How completely each work category is recorded, which decides what may be trued up. */
  coverage?: Record<string, 'complete' | 'partial' | 'untracked'>
  /** Which category feeds which planner cost item: plantingId → costItemId → category. */
  costItemMap?: Record<string, Record<string, string>>
}

/**
 * An NFC tag paired to something on the farm. The id is the tag's own serial, the number
 * burned in at the factory, so a tag is the same tag whatever it is written with and a tag
 * that gets rewritten can be recovered. What it points at can be changed or cleared as often
 * as you like, which is the whole point: the tag stays on the trunk, the pairing moves.
 */
export interface Tag extends Stamped {
  id: string
  /** What the tag currently opens. Absent means the tag exists but is paired to nothing. */
  target?: Target
  /** When the current pairing was made, ISO date. */
  pairedAt?: string
  /** A note to tell one tag from another in a list: "blue sticker", "north gate". */
  name?: string
  notes?: string
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
  people: Record<string, Person>
  tasks: Record<string, Task>
  logs: Record<string, WorkLog>
  harvests: Record<string, Harvest>
  /** NFC tags by their own serial number. */
  tags: Record<string, Tag>
  /** Position coordinate overrides by posKey. */
  nudges: Record<string, LngLat>
  /** Graft plans keyed `${year}:${posKey}`. */
  plans: Record<string, GraftPlan>
  /**
   * Events kept but not acted on, because this build does not know the type or cannot
   * describe the payload. Always zero on an up-to-date device; above zero it means another
   * device is ahead of this one, which is worth saying out loud rather than showing less.
   */
  beyond: number
  /** Number of events applied and the timestamp of the last one. */
  applied: number
  lastTs: number
}

export type EntityKind =
  | 'block'
  | 'row'
  | 'position'
  | 'feature'
  | 'variety'
  | 'tree'
  | 'person'
  | 'task'
  | 'log'
  | 'harvest'
  | 'tag'

export function planKey(year: number, posKey: string): string {
  return `${year}:${posKey}`
}
