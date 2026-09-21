/**
 * Certification records (DESIGN.md §7). A certifier asks for four things: what was applied
 * and where, what came off, where the planting stock came from, and how buffers and equipment
 * were handled. The field book already records all of it for its own reasons, so this module
 * only selects and shapes it. Nothing new is stored.
 *
 * One row per application rather than per log, because a log can carry several products and
 * an inspector reads down a product column.
 */
import type { FarmState, Harvest, Material, Variety, WorkLog } from '@/model/types'
import { live } from '@/events/reduce'
import { hoursOf, targetLabel } from './logs'
import { categoryLabel } from '@/model/categories'
import { positionByKey } from '@/state/derived'

export interface Range {
  from: string
  to: string
}

function inRange(date: string, r: Range): boolean {
  return (!r.from || date >= r.from) && (!r.to || date <= r.to)
}

/** A product going out: one row per material on a log, with where and who. */
export interface Application {
  date: string
  product: string
  rate?: string
  amount?: number
  unit?: string
  lot?: string
  where: string
  people: string
  category: string
  notes?: string
  logId: string
}

export function applications(state: FarmState, r: Range): Application[] {
  const out: Application[] = []
  for (const l of live.logs(state)) {
    if (!inRange(l.date, r) || !l.materials?.length) continue
    const where = l.targets.map((t) => targetLabel(state, t)).join('; ') || 'not recorded'
    const people = l.personIds.map((id) => state.people[id]?.name ?? id).join('; ')
    for (const m of l.materials) {
      out.push({
        date: l.date,
        product: m.product,
        ...(m.rate ? { rate: m.rate } : {}),
        ...(m.amount !== undefined ? { amount: m.amount } : {}),
        ...(m.unit ? { unit: m.unit } : {}),
        ...(m.lot ? { lot: m.lot } : {}),
        where,
        people,
        category: categoryLabel(l.category, state.farm?.categories),
        ...(l.notes ? { notes: l.notes } : {}),
        logId: l.id,
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Where the trees came from, and when they went in: the planting-stock question. */
export interface StockLine {
  variety: string
  species: string
  group?: string
  source: string
  trees: number
  blocks: string
  firstPlanted?: string
  lastPlanted?: string
}

export function plantingStock(state: FarmState): StockLine[] {
  const byVariety = new Map<string, { trees: number; blocks: Set<string>; dates: string[] }>()
  const positions = positionByKey(state)
  for (const t of live.trees(state)) {
    if (!t.varietyId || t.status === 'removed') continue
    const row = byVariety.get(t.varietyId) ?? { trees: 0, blocks: new Set<string>(), dates: [] }
    row.trees += 1
    const p = positions.get(t.posKey)
    const block = p ? state.blocks[p.blockId] : undefined
    if (block) row.blocks.add(block.code)
    if (t.plantedDate) row.dates.push(t.plantedDate)
    byVariety.set(t.varietyId, row)
  }
  const out: StockLine[] = []
  for (const v of live.varieties(state)) {
    const row = byVariety.get(v.id)
    if (!row) continue
    const dates = row.dates.sort()
    out.push({
      variety: v.name,
      species: v.species,
      ...(v.group ? { group: v.group } : {}),
      source: v.source ?? 'not recorded',
      trees: row.trees,
      blocks: [...row.blocks].sort().join('; '),
      ...(dates[0] ? { firstPlanted: dates[0] } : {}),
      ...(dates.length > 1 ? { lastPlanted: dates[dates.length - 1]! } : {}),
    })
  }
  return out.sort(
    (a, b) => a.species.localeCompare(b.species) || a.variety.localeCompare(b.variety),
  )
}

/** Logs in a category, for the buffer-zone and equipment-cleaning questions. */
export function logsInCategories(
  state: FarmState,
  r: Range,
  categories: readonly string[],
): WorkLog[] {
  const want = new Set(categories.map((c) => c.toLowerCase()))
  return live
    .logs(state)
    .filter((l) => inRange(l.date, r) && l.category && want.has(l.category.toLowerCase()))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function harvestsInRange(state: FarmState, r: Range): Harvest[] {
  return live
    .harvests(state)
    .filter((h) => inRange(h.date, r))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function logsInRange(state: FarmState, r: Range): WorkLog[] {
  return live
    .logs(state)
    .filter((l) => inRange(l.date, r))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(header: readonly string[], rows: readonly unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}

export function applicationsToCsv(rows: readonly Application[]): string {
  return csv(
    [
      'date',
      'product',
      'rate',
      'amount',
      'unit',
      'lot',
      'where',
      'applied by',
      'category',
      'notes',
    ],
    rows.map((a) => [
      a.date,
      a.product,
      a.rate,
      a.amount,
      a.unit,
      a.lot,
      a.where,
      a.people,
      a.category,
      a.notes,
    ]),
  )
}

export function plantingStockToCsv(rows: readonly StockLine[]): string {
  return csv(
    ['species', 'variety', 'type', 'source', 'trees', 'blocks', 'first planted', 'last planted'],
    rows.map((s) => [
      s.species,
      s.variety,
      s.group,
      s.source,
      s.trees,
      s.blocks,
      s.firstPlanted,
      s.lastPlanted,
    ]),
  )
}

/** What a season looks like at a glance, for the front of a packet. */
export interface Summary {
  applications: number
  products: string[]
  harvestEntries: number
  harvestByCrop: { crop: string; quantity: number; unit: string }[]
  hours: number
  logs: number
  varieties: number
  varietiesWithoutSource: string[]
  treesWithoutPlantedDate: number
}

export function summarize(state: FarmState, r: Range): Summary {
  const apps = applications(state, r)
  const logs = logsInRange(state, r)
  const stock = plantingStock(state)
  const byCrop = new Map<string, { crop: string; quantity: number; unit: string }>()
  for (const h of harvestsInRange(state, r)) {
    const key = `${h.crop}|${h.unit}`
    const row = byCrop.get(key) ?? { crop: h.crop, quantity: 0, unit: h.unit }
    row.quantity += h.quantity
    byCrop.set(key, row)
  }
  return {
    applications: apps.length,
    products: [...new Set(apps.map((a) => a.product))].sort(),
    harvestEntries: harvestsInRange(state, r).length,
    harvestByCrop: [...byCrop.values()].sort((a, b) => b.quantity - a.quantity),
    hours: Math.round(logs.reduce((n, l) => n + hoursOf(l), 0) * 10) / 10,
    logs: logs.length,
    varieties: stock.length,
    varietiesWithoutSource: stock.filter((s) => s.source === 'not recorded').map((s) => s.variety),
    treesWithoutPlantedDate: live
      .trees(state)
      .filter((t) => t.status !== 'removed' && !t.plantedDate).length,
  }
}

/** A calendar year, which is what a certifier normally asks for. */
export function yearRange(year: number): Range {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

export type { Material, Variety }
