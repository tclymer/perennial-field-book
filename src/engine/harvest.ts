/**
 * Harvest arithmetic (DESIGN.md §3.6): the day's tally sheet, yields grouped for reports,
 * per-tree shares derived from variety + place entries, and the CSV. Pure functions.
 */
import type { FarmState, Harvest, LngLat, Ring } from '@/model/types'
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

/** Where a crop is picked: its blocks, and greenhouses that hold trees of it (or any greenhouse). */
export function placesFor(state: FarmState, crop: string): Place[] {
  const key = cropKey(crop)
  const out: Place[] = []
  const blocks = live.blocks(state)
  for (const b of blocks) {
    const species = b.species ? cropKey(b.species) : undefined
    const has =
      species === key ||
      positions(state).some(
        (p) => p.blockId === b.id && cropKey(varietyAt(state, p)?.species ?? '') === key,
      )
    if (has) out.push({ kind: 'block', id: b.id, label: `${b.code} ${b.name}` })
  }
  const greenhouses = live.features(state).filter((f) => f.kind === 'greenhouse')
  const withCrop = greenhouses.filter(
    (f) =>
      f.geometry.type === 'Polygon' &&
      positions(state).some(
        (p) =>
          cropKey(varietyAt(state, p)?.species ?? '') === key &&
          f.geometry.type === 'Polygon' &&
          inRing(f.geometry.coordinates, p.coord),
      ),
  )
  // Greenhouses that hold this crop; failing that, offer them all only when nowhere else fits.
  for (const f of withCrop.length ? withCrop : out.length ? [] : greenhouses) {
    out.push({ kind: 'feature', id: f.id, label: f.name })
  }
  return out
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
