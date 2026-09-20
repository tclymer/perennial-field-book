/**
 * Turning logged hours into hours per planting (DESIGN.md §3.4). A log records facts; these
 * rules turn facts into block-level hours at report time, so changing a rule re-reads history
 * rather than rewriting it.
 *
 * A log pointing at a block, row, or tree belongs to that block. One pointing at a crop
 * splits across that crop's blocks by area; one pointing at the whole farm splits across
 * every block by area. A log pointing at a building, an area, or nothing at all is overhead.
 */
import type { FarmState, Target, WorkLog } from '@/model/types'
import { live } from '@/events/reduce'
import { blockAreaSqFt } from './layout'
import { blocksOfTarget, hoursOf } from './logs'
import { cropKey } from '@/model/harvest'

export interface DateRange {
  from?: string
  to?: string
}

export function inRange(date: string, range: DateRange = {}): boolean {
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

/** Area per block, in square feet, preferring the planner's own geometry. */
export function blockAreas(state: FarmState): Map<string, number> {
  const rows = live.rows(state)
  const m = new Map<string, number>()
  for (const b of live.blocks(state)) {
    m.set(
      b.id,
      blockAreaSqFt(
        b,
        rows.filter((r) => r.blockId === b.id),
      ),
    )
  }
  return m
}

/** Split one quantity across blocks in proportion to area; equally when no area is known. */
function splitByArea(
  blockIds: string[],
  areas: Map<string, number>,
  quantity: number,
): Map<string, number> {
  const out = new Map<string, number>()
  if (blockIds.length === 0) return out
  const total = blockIds.reduce((sum, id) => sum + (areas.get(id) ?? 0), 0)
  for (const id of blockIds) {
    const share = total > 0 ? (areas.get(id) ?? 0) / total : 1 / blockIds.length
    out.set(id, quantity * share)
  }
  return out
}

/** Which blocks a crop word stands for. */
export function blocksOfSpecies(state: FarmState, species: string): string[] {
  const key = cropKey(species)
  return live
    .blocks(state)
    .filter((b) => cropKey(b.species ?? '') === key)
    .map((b) => b.id)
}

export interface Allocation {
  /** Hours per block id. */
  blocks: Map<string, number>
  /** Hours that belong to no planting: buildings, areas, and untargeted work. */
  overhead: number
}

/** Where one log's hours go. Exported so a page can explain a single log. */
export function allocateLog(
  state: FarmState,
  log: WorkLog,
  areas: Map<string, number>,
): Allocation {
  const hours = hoursOf(log)
  const blocks = new Map<string, number>()
  if (hours === 0) return { blocks, overhead: 0 }

  const direct = new Set<string>()
  let species: Target | undefined
  let farmWide = false
  for (const t of log.targets) {
    if (t.kind === 'farm') farmWide = true
    else if (t.kind === 'species') species = t
    else for (const id of blocksOfTarget(state, t)) direct.add(id)
  }

  // A named place wins over a crop, and a crop over the whole farm.
  if (direct.size > 0) {
    const each = hours / direct.size
    for (const id of direct) blocks.set(id, (blocks.get(id) ?? 0) + each)
    return { blocks, overhead: 0 }
  }
  if (species && species.kind === 'species') {
    const ids = blocksOfSpecies(state, species.species)
    if (ids.length > 0) return { blocks: splitByArea(ids, areas, hours), overhead: 0 }
    return { blocks, overhead: hours }
  }
  if (farmWide) {
    const ids = live.blocks(state).map((b) => b.id)
    if (ids.length > 0) return { blocks: splitByArea(ids, areas, hours), overhead: 0 }
    return { blocks, overhead: hours }
  }
  return { blocks, overhead: hours }
}

export interface BlockHours {
  /** Hours per block id, then per category (`''` for uncategorized). */
  byBlock: Map<string, Map<string, number>>
  /** Overhead hours per category. */
  overhead: Map<string, number>
  /** Every log that contributed, for the evidence line. */
  logs: WorkLog[]
}

/** All logged hours in a range, allocated. */
export function allocateHours(state: FarmState, range: DateRange = {}): BlockHours {
  const areas = blockAreas(state)
  const byBlock = new Map<string, Map<string, number>>()
  const overhead = new Map<string, number>()
  const logs: WorkLog[] = []
  for (const log of live.logs(state)) {
    if (!inRange(log.date, range)) continue
    const hours = hoursOf(log)
    if (hours === 0) continue
    logs.push(log)
    const category = log.category ?? ''
    const a = allocateLog(state, log, areas)
    for (const [blockId, h] of a.blocks) {
      const perCategory = byBlock.get(blockId) ?? new Map<string, number>()
      perCategory.set(category, (perCategory.get(category) ?? 0) + h)
      byBlock.set(blockId, perCategory)
    }
    if (a.overhead > 0) overhead.set(category, (overhead.get(category) ?? 0) + a.overhead)
  }
  return { byBlock, overhead, logs }
}

export interface Evidence {
  logs: number
  hours: number
  from?: string
  to?: string
}

/** Hours for one block and category, with the logs behind them, for the comparison table. */
export function evidenceFor(
  state: FarmState,
  blockId: string,
  category: string,
  range: DateRange = {},
): Evidence {
  const areas = blockAreas(state)
  let hours = 0
  let count = 0
  let from: string | undefined
  let to: string | undefined
  for (const log of live.logs(state)) {
    if (!inRange(log.date, range)) continue
    if ((log.category ?? '') !== category) continue
    const share = allocateLog(state, log, areas).blocks.get(blockId)
    if (!share) continue
    hours += share
    count += 1
    if (!from || log.date < from) from = log.date
    if (!to || log.date > to) to = log.date
  }
  return { logs: count, hours, ...(from ? { from } : {}), ...(to ? { to } : {}) }
}

export function totalOverhead(alloc: BlockHours): number {
  let n = 0
  for (const h of alloc.overhead.values()) n += h
  return n
}
