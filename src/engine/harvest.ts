/**
 * Harvest arithmetic (DESIGN.md §3.6): the day's tally sheet, yields grouped for reports,
 * per-tree shares derived from variety + place entries, and the CSV. Pure functions.
 */
import type { FarmState, Harvest, LngLat, Ring, Variety } from '@/model/types'
import { live } from '@/events/reduce'
import { cropKey } from '@/model/harvest'
import { positionByKey, positions, varietyAt } from '@/state/derived'

export interface TallyLine {
  varietyId: string | null
  label: string
  boxes: number
  quantity: number
  unit: string
}

export interface Session {
  date: string
  crop: string
  entries: Harvest[]
  tally: TallyLine[]
  /** Totals per unit, since a session is one crop and normally one unit. */
  totals: { unit: string; quantity: number; boxes: number }[]
  nextBox: number
}

function byBox(a: Harvest, b: Harvest): number {
  return (a.box ?? 0) - (b.box ?? 0) || a.createdAt - b.createdAt
}

function totalsOf(entries: readonly Harvest[]) {
  const m = new Map<string, { unit: string; quantity: number; boxes: number }>()
  for (const e of entries) {
    const t = m.get(e.unit) ?? { unit: e.unit, quantity: 0, boxes: 0 }
    t.quantity += e.quantity
    t.boxes += 1
    m.set(e.unit, t)
  }
  return [...m.values()].sort((a, b) => b.quantity - a.quantity)
}

/** Crops this farm grows, from blocks and varieties, the most planted first. */
export function cropsOf(state: FarmState): string[] {
  const counts = new Map<string, number>()
  const bump = (name: string | undefined, n: number) => {
    const key = cropKey(name ?? '')
    if (!key) return
    counts.set(key, (counts.get(key) ?? 0) + n)
  }
  for (const p of positions(state)) {
    const v = varietyAt(state, p)
    bump(v?.species ?? state.blocks[p.blockId]?.species, 1)
  }
  for (const b of live.blocks(state)) bump(b.species, 0)
  for (const v of live.varieties(state)) bump(v.species, 0)
  for (const h of live.harvests(state)) bump(h.crop, 0)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c)
}

/** One day of one crop: the tally sheet. */
export function sessionOf(state: FarmState, date: string, crop: string): Session {
  const key = cropKey(crop)
  const entries = live
    .harvests(state)
    .filter((h) => h.date === date && cropKey(h.crop) === key)
    .sort(byBox)
  const lines = new Map<string | null, TallyLine>()
  for (const e of entries) {
    const id = e.varietyId ?? null
    const line = lines.get(id) ?? {
      varietyId: id,
      label: id ? (state.varieties[id]?.name ?? 'unknown variety') : 'Mixed',
      boxes: 0,
      quantity: 0,
      unit: e.unit,
    }
    line.boxes += 1
    line.quantity += e.quantity
    lines.set(id, line)
  }
  const tally = [...lines.values()].sort((a, b) => b.quantity - a.quantity)
  const nextBox = entries.reduce((n, e) => Math.max(n, e.box ?? 0), 0) + 1
  return { date, crop: key, entries, tally, totals: totalsOf(entries), nextBox }
}

/** Every date and crop with entries, newest first. */
export function sessions(state: FarmState): Session[] {
  const seen = new Map<string, { date: string; crop: string }>()
  for (const h of live.harvests(state)) {
    const crop = cropKey(h.crop)
    seen.set(`${h.date}|${crop}`, { date: h.date, crop })
  }
  return [...seen.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.crop.localeCompare(b.crop)))
    .map(({ date, crop }) => sessionOf(state, date, crop))
}

/** Quantities read better without trailing zeros; counts are whole anyway. */
export function formatQuantity(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/** 2026-09-19 as 9/19/26, the way a date is written on a box. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`
}

/**
 * What to write on the box: where it came from, what it is, what it weighs, and when.
 * The block code alone, since that is what goes on a box in the field.
 */
export function boxLabel(state: FarmState, h: Harvest): string {
  const parts: string[] = []
  if (h.posKey) {
    parts.push(positionByKey(state).get(h.posKey)?.label ?? h.posKey)
  } else if (h.blockId) {
    const b = state.blocks[h.blockId]
    if (b) parts.push(b.code)
  } else if (h.featureId) {
    const f = state.features[h.featureId]
    if (f) parts.push(f.name)
  }
  parts.push(h.varietyId ? (state.varieties[h.varietyId]?.name ?? 'unknown') : 'Mixed')
  parts.push(`${formatQuantity(h.quantity)} ${h.unit}`)
  parts.push(shortDate(h.date))
  return parts.join(' · ')
}

export function placeLabel(state: FarmState, h: Pick<Harvest, 'blockId' | 'featureId'>): string {
  if (h.blockId) {
    const b = state.blocks[h.blockId]
    return b ? `${b.code} ${b.name}` : 'a block'
  }
  if (h.featureId) return state.features[h.featureId]?.name ?? 'a place'
  return ''
}

export type YieldBy = 'variety' | 'place' | 'year' | 'varietyPlace' | 'crop'

export interface YieldRow {
  key: string
  label: string
  unit: string
  quantity: number
  boxes: number
}

/** Quantities grouped one way, largest first; different units never add together. */
export function yieldBy(state: FarmState, entries: readonly Harvest[], by: YieldBy): YieldRow[] {
  const m = new Map<string, YieldRow>()
  for (const h of entries) {
    let key: string
    let label: string
    const variety = h.varietyId ? (state.varieties[h.varietyId]?.name ?? 'unknown') : 'Mixed'
    const place = placeLabel(state, h) || 'Anywhere'
    switch (by) {
      case 'variety':
        key = h.varietyId ?? ''
        label = variety
        break
      case 'place':
        key = h.blockId ?? h.featureId ?? ''
        label = place
        break
      case 'year':
        key = h.date.slice(0, 4)
        label = key
        break
      case 'varietyPlace':
        key = `${h.varietyId ?? ''}|${h.blockId ?? h.featureId ?? ''}`
        label = `${variety} · ${place}`
        break
      case 'crop':
        key = cropKey(h.crop)
        label = key
        break
    }
    const full = `${key}|${h.unit}`
    const row = m.get(full) ?? { key: full, label, unit: h.unit, quantity: 0, boxes: 0 }
    row.quantity += h.quantity
    row.boxes += 1
    m.set(full, row)
  }
  // Units never interleave: the biggest unit's rows first, largest within each.
  const perUnit = new Map<string, number>()
  for (const r of m.values()) perUnit.set(r.unit, (perUnit.get(r.unit) ?? 0) + r.quantity)
  return [...m.values()].sort(
    (a, b) =>
      (perUnit.get(b.unit) ?? 0) - (perUnit.get(a.unit) ?? 0) ||
      a.unit.localeCompare(b.unit) ||
      b.quantity - a.quantity ||
      a.label.localeCompare(b.label),
  )
}

export interface TreeShare {
  quantity: number
  unit: string
  /** Direct entries on this tree. */
  direct: number
  /** Entries shared with other trees, and how many trees each was split across. */
  shared: { entryId: string; among: number }[]
}

function alive(state: FarmState, posKey: string): boolean {
  const trees = Object.values(state.trees).filter((t) => t.posKey === posKey && !t.deleted)
  const current = trees.sort((a, b) => b.createdAt - a.createdAt)[0]
  return Boolean(current && (current.status === 'alive' || current.status === 'struggling'))
}

/**
 * Per-tree yield for a year. A tree entry goes to its tree; a variety + place entry is
 * split equally across that variety's living trees there; a variety with no place across
 * all its living trees; an entry with no variety is not attributed.
 */
export function treeShares(state: FarmState, year: number | string): Map<string, TreeShare> {
  const y = String(year)
  const out = new Map<string, TreeShare>()
  const add = (posKey: string, unit: string, q: number, entry: Harvest, among: number) => {
    const s = out.get(posKey) ?? { quantity: 0, unit, direct: 0, shared: [] }
    s.quantity += q
    if (among === 1 && entry.posKey) s.direct += q
    else s.shared.push({ entryId: entry.id, among })
    out.set(posKey, s)
  }
  const all = positions(state)
  for (const h of live.harvests(state)) {
    if (!h.date.startsWith(y)) continue
    if (h.posKey) {
      add(h.posKey, h.unit, h.quantity, h, 1)
      continue
    }
    if (!h.varietyId) continue
    const candidates = all.filter(
      (p) =>
        varietyAt(state, p)?.id === h.varietyId &&
        (!h.blockId || p.blockId === h.blockId) &&
        alive(state, p.posKey),
    )
    if (candidates.length === 0) continue
    const share = h.quantity / candidates.length
    for (const p of candidates) add(p.posKey, h.unit, share, h, candidates.length)
  }
  return out
}

export interface TreeYear {
  year: string
  quantity: number
  unit: string
  direct: number
  sharedAmong: number[]
}

/** A tree's derived yield by year, newest first. */
export function treeYieldByYear(state: FarmState, posKey: string): TreeYear[] {
  const years = new Set(live.harvests(state).map((h) => h.date.slice(0, 4)))
  const out: TreeYear[] = []
  for (const year of years) {
    const share = treeShares(state, year).get(posKey)
    if (!share) continue
    out.push({
      year,
      quantity: share.quantity,
      unit: share.unit,
      direct: share.direct,
      sharedAmong: [...new Set(share.shared.map((s) => s.among))],
    })
  }
  return out.sort((a, b) => b.year.localeCompare(a.year))
}

function inRing(ring: Ring, p: LngLat): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const cross = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    if (cross) inside = !inside
  }
  return inside
}

export interface Place {
  kind: 'block' | 'feature'
  id: string
  label: string
}

/**
 * Where a crop is picked. Blocks, and nothing else while the crop has one.
 *
 * A greenhouse can hold a crop, but the trees in it already belong to a block, and only a
 * block carries a harvest into the planner comparison. Offering the greenhouse alongside its
 * own block gave the same picking two chips, one of which filed the weight where no report
 * would find it. So a greenhouse is offered only as a last resort: a crop with no block
 * anywhere still needs somewhere to put a number.
 */
export function placesFor(state: FarmState, crop: string): Place[] {
  const key = cropKey(crop)
  const out: Place[] = []
  for (const b of live.blocks(state)) {
    const species = b.species ? cropKey(b.species) : undefined
    const has =
      species === key ||
      positions(state).some(
        (p) => p.blockId === b.id && cropKey(varietyAt(state, p)?.species ?? '') === key,
      )
    if (has) out.push({ kind: 'block', id: b.id, label: `${b.code} ${b.name}` })
  }
  if (out.length > 0) return out
  for (const f of live.features(state)) {
    if (f.kind === 'greenhouse') out.push({ kind: 'feature', id: f.id, label: f.name })
  }
  return out
}

/** Is this position in that place? A block by id, a greenhouse by its outline. */
export function positionInPlace(
  state: FarmState,
  p: { blockId: string; coord: LngLat },
  place: Place | null,
): boolean {
  if (!place) return true
  if (place.kind === 'block') return p.blockId === place.id
  const f = state.features[place.id]
  if (!f || f.deleted) return false
  if (f.geometry.type !== 'Polygon') return false
  return inRing(f.geometry.coordinates, p.coord)
}

/**
 * The varieties of a crop actually standing in a place (or anywhere, with no place), most
 * planted first. The entry screen offers these; anything else is found by searching.
 */
export function varietiesIn(state: FarmState, crop: string, place: Place | null): Variety[] {
  const key = cropKey(crop)
  const counts = new Map<string, number>()
  for (const p of positions(state)) {
    const v = varietyAt(state, p)
    if (!v || cropKey(v.species) !== key) continue
    if (!positionInPlace(state, p, place)) continue
    counts.set(v.id, (counts.get(v.id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ variety: state.varieties[id], n }))
    .filter((x): x is { variety: Variety; n: number } => Boolean(x.variety && !x.variety.deleted))
    .sort((a, b) => b.n - a.n || a.variety.name.localeCompare(b.variety.name))
    .map((x) => x.variety)
}

/** Every variety of a crop, for the search that is not limited to one place. */
export function allVarietiesOf(state: FarmState, crop: string): Variety[] {
  const key = cropKey(crop)
  return live
    .varieties(state)
    .filter((v) => cropKey(v.species) === key)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Varieties and places used in the latest sessions of a crop, most recent first. */
export function recentChoices(state: FarmState, crop: string) {
  const key = cropKey(crop)
  const recent = live
    .harvests(state)
    .filter((h) => cropKey(h.crop) === key)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
    .slice(0, 200)
  const varieties: string[] = []
  const places: string[] = []
  for (const h of recent) {
    if (h.varietyId && !varieties.includes(h.varietyId)) varieties.push(h.varietyId)
    const place = h.blockId ?? h.featureId
    if (place && !places.includes(place)) places.push(place)
  }
  return { varieties, places }
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function harvestsToCsv(state: FarmState, entries: readonly Harvest[]): string {
  const header = [
    'date',
    'crop',
    'box',
    'variety',
    'place',
    'tree',
    'quantity',
    'unit',
    'people',
    'notes',
  ]
  const rows = [...entries]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byBox(a, b)))
    .map((h) =>
      [
        h.date,
        cropKey(h.crop),
        h.box ?? '',
        h.varietyId ? (state.varieties[h.varietyId]?.name ?? '') : '',
        placeLabel(state, h),
        h.posKey ? (positionByKey(state).get(h.posKey)?.label ?? h.posKey) : '',
        h.quantity,
        h.unit,
        (h.personIds ?? []).map((id) => state.people[id]?.name ?? id).join('; '),
        h.notes ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n') + '\n'
}
