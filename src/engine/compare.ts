/**
 * The planner comparison (DESIGN.md §6): a season of records beside the planner's estimates,
 * as a list of proposed corrections the farm ticks or ignores.
 *
 * The planner stores rates, not totals: a labor cost item's `quantity` is hours on a basis
 * (per acre, per row foot, per plant), and harvest labor is units picked per hour. So a
 * measured total is divided by that basis before it can be compared. A yield "actual" is a
 * fraction of mature yield, computed exactly as the planner computes expected yield.
 */
import { z } from 'zod'
import type { Block, FarmState } from '@/model/types'
import { live } from '@/events/reduce'
import { cropKey } from '@/model/harvest'
import { allocateHours, evidenceFor, type DateRange, type Evidence } from './allocate'
import { blockAreas } from './allocate'

// --- the part of a planner backup this needs, validated loosely so nothing else is lost

const costItem = z
  .object({
    id: z.string(),
    label: z.string(),
    block: z.string().optional(),
    basis: z.string().optional(),
    quantity: z.number().optional(),
    isLabor: z.boolean().optional(),
    unitCostRef: z.string().optional(),
    notes: z.string().optional(),
  })
  .loose()

const planting = z
  .object({
    id: z.string(),
    name: z.string(),
    plantedYear: z.number().optional(),
    geometry: z
      .object({
        rowLengthFt: z.number().optional(),
        rowWidthFt: z.number().optional(),
        inRowSpacingFt: z.number().optional(),
        rows: z.number().optional(),
      })
      .loose()
      .optional(),
    yield: z
      .object({
        maturePerPlant: z.number().optional(),
        unit: z.string().optional(),
        unitsPerHarvestHour: z.number().optional(),
      })
      .loose()
      .optional(),
    costItems: z.array(costItem).optional(),
    harvestItems: z.array(costItem).optional(),
    actuals: z
      .array(
        z
          .object({ year: z.number(), yieldRealization: z.number(), note: z.string().optional() })
          .loose(),
      )
      .optional(),
    taskCalendar: z
      .array(z.object({ costItemId: z.string(), months: z.array(z.number()) }).loose())
      .optional(),
  })
  .loose()

export const backup = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    schemaVersion: z.number().optional(),
    exportedAt: z.string().optional(),
    settings: z
      .looseObject({ baseWage: z.number().optional(), laborBurdenPct: z.number().optional() })
      .optional(),
    plantings: z.array(planting).max(1000),
  })
  .loose()

export type PlannerBackup = z.infer<typeof backup>
export type PlannerPlanting = z.infer<typeof planting>
export type PlannerCostItem = z.infer<typeof costItem>

/** Parse a backup for comparison. Throws a readable message. */
export function parseBackup(text: string): { raw: unknown; farm: PlannerBackup } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const result = backup.safeParse(raw)
  if (!result.success) throw new Error('That file is not a Perennial Profit Planner backup.')
  return { raw, farm: result.data }
}

/** Whole days since the backup was exported; undefined when it does not say. */
export function backupAgeDays(farm: PlannerBackup, now = new Date()): number | undefined {
  if (!farm.exportedAt) return undefined
  const then = Date.parse(farm.exportedAt)
  if (!Number.isFinite(then)) return undefined
  return Math.floor((now.getTime() - then) / 86_400_000)
}

/** The planner's loaded wage: base wage plus its burden. */
export function loadedWage(farm: PlannerBackup): number {
  const base = farm.settings?.baseWage ?? 0
  const burden = farm.settings?.laborBurdenPct ?? 0
  return base * (1 + burden)
}

// --- the planner's own arithmetic, copied so the numbers agree exactly

export interface Denominators {
  /** rowLengthFt / inRowSpacingFt, unrounded, as the planner does it. */
  plantsPerRow: number
  rows: number
  plants: number
  acres: number
  rowFeet: number
  /** maturePerPlant × plantsPerRow × rows. */
  matureYield: number
}

export function denominators(p: PlannerPlanting): Denominators {
  const g = p.geometry ?? {}
  const rowLengthFt = g.rowLengthFt ?? 0
  const inRowSpacingFt = g.inRowSpacingFt ?? 0
  const rows = g.rows ?? 0
  const plantsPerRow = inRowSpacingFt > 0 ? rowLengthFt / inRowSpacingFt : 0
  const acres = ((rowLengthFt * (g.rowWidthFt ?? 0)) / 43560) * rows
  return {
    plantsPerRow,
    rows,
    plants: plantsPerRow * rows,
    acres,
    rowFeet: rowLengthFt * rows,
    matureYield: (p.yield?.maturePerPlant ?? 0) * plantsPerRow * rows,
  }
}

/** Every labor item of a planting, harvest items included. */
export function laborItems(p: PlannerPlanting): PlannerCostItem[] {
  return [...(p.costItems ?? []), ...(p.harvestItems ?? [])].filter((i) => i.isLabor)
}

/** What one unit of a labor item's basis is worth, for turning hours into that item's rate. */
export function basisDenominator(item: PlannerCostItem, d: Denominators): number | undefined {
  switch (item.basis) {
    case 'perAcre':
      return d.acres
    case 'perRowFoot':
      return d.rowFeet
    case 'perPlant':
      return d.plants
    case 'fixed':
    case 'laborHours':
      return 1
    default:
      // perYieldUnit items are harvest labor: compared through unitsPerHarvestHour instead.
      return undefined
  }
}

export function basisUnit(item: PlannerCostItem): string {
  switch (item.basis) {
    case 'perAcre':
      return 'h/acre'
    case 'perRowFoot':
      return 'h/row ft'
    case 'perPlant':
      return 'h/plant'
    default:
      return 'h'
  }
}

// --- coverage

export type Coverage = 'complete' | 'partial' | 'untracked'

export function coverageOf(state: FarmState, category: string): Coverage {
  return (state.farm?.coverage?.[category] as Coverage | undefined) ?? 'partial'
}

// --- the diff

export type Field =
  | { kind: 'plantedYear' }
  | { kind: 'yieldRealization'; year: number }
  | { kind: 'unitsPerHarvestHour' }
  | { kind: 'costItem'; itemId: string; label: string; basis: string }

export interface Row {
  /** Stable key for a checkbox. */
  key: string
  field: Field
  title: string
  planner?: number
  measured?: number
  unit: string
  evidence: Evidence & { quantity?: number }
  coverage: Coverage
  /** Why the row cannot be applied, when it cannot. */
  blocked?: string
  note: string
}

export interface PlantingComparison {
  planting: PlannerPlanting
  block: Block
  year: number
  rows: Row[]
  /** Set when the farm's harvest unit and the planner's differ. */
  unitMismatch?: { planner: string; farm: string }
}

function round(n: number, places = 3): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** Which field-book category feeds a planner cost item, from the farm's map or a guess. */
export function categoryFor(
  state: FarmState,
  plantingId: string,
  item: PlannerCostItem,
): string | undefined {
  const mapped = state.farm?.costItemMap?.[plantingId]?.[item.id]
  if (mapped !== undefined) return mapped || undefined
  return guessCategory(item.label)
}

// Word-anchored, because a loose "thin" matches "something" and a loose "tie" matches "ties".
const LABEL_RULES: [RegExp, string][] = [
  [/\bprun/i, 'pruning'],
  [/\b(trellis|train|tying|tie[ds]?\b)/i, 'training'],
  [/\b(fertiliz|compost|nutrient|lime\b|manure)/i, 'fertilizing'],
  [/\bmow/i, 'mowing'],
  [/\b(weed|herbicid|cultivat)/i, 'weeding'],
  [/\b(spray|pest|disease|fungicid)/i, 'spraying'],
  [/\b(irrigat|water)/i, 'watering'],
  [/\b(plant|transplant)/i, 'planting'],
  [/\bgraft/i, 'grafting'],
  [/\b(greenhouse|tunnel)/i, 'greenhouse'],
  [/\b(pick|harvest|supervision)/i, 'harvest'],
  [/\b(thin|trim|prop|stake|net|mulch)/i, 'maintenance'],
]

/** A first guess at the category behind a planner item's label. */
export function guessCategory(label: string): string | undefined {
  for (const [re, category] of LABEL_RULES) if (re.test(label)) return category
  return undefined
}

/** How much of a crop was harvested from a block in a year, in the farm's own unit. */
export function harvestedIn(
  state: FarmState,
  blockId: string,
  year: number,
): { quantity: number; unit?: string; entries: number } {
  const y = String(year)
  let quantity = 0
  let unit: string | undefined
  let entries = 0
  const areas = blockAreas(state)
  void areas
  for (const h of live.harvests(state)) {
    if (!h.date.startsWith(y)) continue
    const belongs =
      h.blockId === blockId || (h.posKey ? blockOfPosKey(state, h.posKey) === blockId : false)
    if (!belongs) continue
    quantity += h.quantity
    unit = unit ?? h.unit
    entries += 1
  }
  return { quantity, unit, entries }
}

function blockOfPosKey(state: FarmState, posKey: string): string | undefined {
  const row = Object.values(state.rows).find((r) => posKey.startsWith(`${r.id}:`))
  if (row) return row.blockId
  return state.loosePositions[posKey]?.blockId
}

/** The earliest planting date recorded among a block's trees. */
export function firstPlantedYear(state: FarmState, blockId: string): number | undefined {
  let best: string | undefined
  for (const t of live.trees(state)) {
    if (!t.plantedDate) continue
    if (blockOfPosKey(state, t.posKey) !== blockId) continue
    if (!best || t.plantedDate < best) best = t.plantedDate
  }
  return best ? Number(best.slice(0, 4)) : undefined
}

/** Compare one planting against one block's records for a year. */
export function comparePlanting(
  state: FarmState,
  p: PlannerPlanting,
  block: Block,
  year: number,
): PlantingComparison {
  const range: DateRange = { from: `${year}-01-01`, to: `${year}-12-31` }
  const d = denominators(p)
  const rows: Row[] = []
  const harvest = harvestedIn(state, block.id, year)
  const plannerUnit = p.yield?.unit
  const unitMismatch =
    harvest.unit && plannerUnit && harvest.unit.toLowerCase() !== plannerUnit.toLowerCase()
      ? { planner: plannerUnit, farm: harvest.unit }
      : undefined

  // Planted year: the planner ignores actuals without one.
  const planted = firstPlantedYear(state, block.id)
  if (planted && p.plantedYear !== planted) {
    rows.push({
      key: 'plantedYear',
      field: { kind: 'plantedYear' },
      title: 'Year planted',
      planner: p.plantedYear,
      measured: planted,
      unit: 'year',
      evidence: { logs: 0, hours: 0 },
      coverage: 'complete',
      note: `Year planted set to ${planted} from the earliest tree record in ${block.code}.`,
    })
  }

  // Yield realization for the year.
  if (harvest.entries > 0 && d.matureYield > 0) {
    const realization = harvest.quantity / d.matureYield
    const current = p.actuals?.find((a) => a.year === year)?.yieldRealization
    rows.push({
      key: `yield:${year}`,
      field: { kind: 'yieldRealization', year },
      title: `Yield realized in ${year}`,
      planner: current,
      measured: round(realization, 4),
      unit: 'of mature',
      evidence: { logs: harvest.entries, hours: 0, quantity: harvest.quantity },
      coverage: 'complete',
      ...(unitMismatch
        ? {
            blocked: `Recorded in ${unitMismatch.farm}, the planner expects ${unitMismatch.planner}.`,
          }
        : {}),
      note: `${round(harvest.quantity, 1)} ${harvest.unit ?? ''} harvested in ${year} from ${block.code}, against ${round(d.matureYield, 1)} at maturity.`,
    })
  }

  // Units per harvest hour, from harvest-category hours against the weight picked.
  const harvestHours = evidenceFor(state, block.id, 'harvest', range)
  if (harvest.quantity > 0 && harvestHours.hours > 0) {
    rows.push({
      key: 'unitsPerHarvestHour',
      field: { kind: 'unitsPerHarvestHour' },
      title: 'Units picked per hour',
      planner: p.yield?.unitsPerHarvestHour,
      measured: round(harvest.quantity / harvestHours.hours, 2),
      unit: `${harvest.unit ?? 'units'}/h`,
      evidence: { ...harvestHours, quantity: harvest.quantity },
      coverage: coverageOf(state, 'harvest'),
      ...(unitMismatch
        ? {
            blocked: `Recorded in ${unitMismatch.farm}, the planner expects ${unitMismatch.planner}.`,
          }
        : {}),
      note: `${round(harvest.quantity, 1)} ${harvest.unit ?? ''} picked in ${round(harvestHours.hours, 1)} hours in ${year}.`,
    })
  }

  // Labor items, each against the category that feeds it.
  for (const item of laborItems(p)) {
    const category = categoryFor(state, p.id, item)
    if (!category || category === 'harvest') continue
    const denom = basisDenominator(item, d)
    if (denom === undefined || denom <= 0) continue
    const ev = evidenceFor(state, block.id, category, range)
    if (ev.hours === 0) continue
    const coverage = coverageOf(state, category)
    rows.push({
      key: `item:${item.id}`,
      field: { kind: 'costItem', itemId: item.id, label: item.label, basis: item.basis ?? 'fixed' },
      title: item.label,
      planner: item.quantity,
      measured: round(ev.hours / denom, 3),
      unit: basisUnit(item),
      evidence: ev,
      coverage,
      ...(coverage === 'untracked' ? { blocked: `${category} is marked as not tracked.` } : {}),
      note: `${round(ev.hours, 1)} hours of ${category} logged on ${block.code} in ${year} across ${ev.logs} ${ev.logs === 1 ? 'log' : 'logs'}.`,
    })
  }

  return { planting: p, block, year, rows, ...(unitMismatch ? { unitMismatch } : {}) }
}

/** Every planting a block links to, compared. */
export function compareAll(
  state: FarmState,
  farm: PlannerBackup,
  year: number,
): {
  comparisons: PlantingComparison[]
  unlinkedBlocks: Block[]
  unmatchedPlantings: PlannerPlanting[]
} {
  const blocks = live.blocks(state)
  const byPlanting = new Map<string, Block>()
  for (const b of blocks) if (b.planner?.plantingId) byPlanting.set(b.planner.plantingId, b)
  const comparisons: PlantingComparison[] = []
  const unmatched: PlannerPlanting[] = []
  for (const p of farm.plantings) {
    const block = byPlanting.get(p.id)
    if (!block) {
      unmatched.push(p)
      continue
    }
    comparisons.push(comparePlanting(state, p, block, year))
  }
  return {
    comparisons: comparisons.sort((a, b) => a.block.code.localeCompare(b.block.code)),
    unlinkedBlocks: blocks.filter((b) => !b.planner?.plantingId),
    unmatchedPlantings: unmatched,
  }
}

/** Overhead hours for a year, and what they would cost at the planner's wage. */
export function overheadSummary(state: FarmState, farm: PlannerBackup, year: number) {
  const alloc = allocateHours(state, { from: `${year}-01-01`, to: `${year}-12-31` })
  const byCategory = [...alloc.overhead.entries()]
    .map(([category, hours]) => ({ category, hours }))
    .sort((a, b) => b.hours - a.hours)
  const hours = byCategory.reduce((n, c) => n + c.hours, 0)
  const wage = loadedWage(farm)
  return { hours, cost: hours * wage, wage, byCategory }
}

/** Crops the farm grows that no planting covers, as a hint that a block needs linking. */
export function unlinkedCrops(state: FarmState): string[] {
  const linked = new Set(
    live
      .blocks(state)
      .filter((b) => b.planner?.plantingId)
      .map((b) => cropKey(b.species ?? '')),
  )
  return [
    ...new Set(
      live
        .blocks(state)
        .map((b) => cropKey(b.species ?? ''))
        .filter((c) => c && !linked.has(c)),
    ),
  ]
}
