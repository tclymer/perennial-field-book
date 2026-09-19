/**
 * Colors for trees on the map and the grid. Twelve palette colors cannot tell fifty
 * varieties apart, so: species get one hue each (types within a species get shades of it),
 * "color by variety" hands out distinct colors per block to the varieties in that block, and
 * a highlight lights up chosen varieties and greys the rest. An explicit color on a variety
 * always wins.
 */
import type { FarmState, Variety } from '@/model/types'
import { live } from '@/events/reduce'
import { positionCountByVariety, positions, varietyAt } from './derived'

function memo<T>(compute: (s: FarmState) => T): (s: FarmState) => T {
  const cache = new WeakMap<FarmState, T>()
  return (s) => {
    const hit = cache.get(s)
    if (hit !== undefined) return hit
    const v = compute(s)
    cache.set(s, v)
    return v
  }
}

/** Strong hues, one per species, most-planted species first. */
export const SPECIES_PALETTE = [
  '#65a30d',
  '#f97316',
  '#0ea5e9',
  '#a855f7',
  '#e11d48',
  '#eab308',
  '#14b8a6',
  '#ec4899',
  '#6366f1',
  '#84cc16',
]

/** Distinct colors for the varieties within one block. */
export const BLOCK_PALETTE = [
  '#f97316',
  '#22d3ee',
  '#a3e635',
  '#f472b6',
  '#facc15',
  '#60a5fa',
  '#c084fc',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#38bdf8',
  '#e879f9',
]

/** Beyond the palette in a block, or outside a highlight. */
export const GREY = '#a8a29e'
export const DIM = '#d6d3d1'

/** Lightness offsets for the types within a species: base, lighter, darker, and so on. */
const SHADES = [0, 16, -16, 30, -30, 42, -42]

export function shade(hex: string, delta: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(12, Math.min(88, l + delta)))
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

function speciesKey(v: Variety): string {
  return v.species.trim().toLowerCase()
}

/** One hue per species, the most planted species first so the big ones get the clearest colors. */
export const speciesColors = memo((s) => {
  const counts = positionCountByVariety(s)
  const perSpecies = new Map<string, { name: string; trees: number }>()
  for (const v of live.varieties(s)) {
    const key = speciesKey(v)
    const cur = perSpecies.get(key) ?? { name: v.species, trees: 0 }
    cur.trees += counts.get(v.id) ?? 0
    perSpecies.set(key, cur)
  }
  const ordered = [...perSpecies.entries()].sort(
    ([, a], [, b]) => b.trees - a.trees || a.name.localeCompare(b.name),
  )
  const m = new Map<string, string>()
  ordered.forEach(([key], i) => m.set(key, SPECIES_PALETTE[i % SPECIES_PALETTE.length]!))
  return m
})

/** Every variety colored by its species, shaded by its type within the species. */
export const varietyColorsBySpecies = memo((s) => {
  const base = speciesColors(s)
  const typesBySpecies = new Map<string, string[]>()
  for (const v of live.varieties(s)) {
    const key = speciesKey(v)
    const t = (v.group ?? '').trim().toLowerCase()
    const list = typesBySpecies.get(key) ?? []
    if (!list.includes(t)) list.push(t)
    typesBySpecies.set(key, list)
  }
  for (const list of typesBySpecies.values()) {
    list.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  }
  const m = new Map<string, string>()
  for (const v of live.varieties(s)) {
    if (v.color) {
      m.set(v.id, v.color)
      continue
    }
    const key = speciesKey(v)
    const hue = base.get(key) ?? GREY
    const types = typesBySpecies.get(key) ?? ['']
    const i = types.indexOf((v.group ?? '').trim().toLowerCase())
    m.set(v.id, types.length > 1 ? shade(hue, SHADES[i % SHADES.length]!) : hue)
  }
  return m
})

/**
 * Per block, distinct colors for the varieties in it, the most planted first; past the
 * palette the rest are grey. Keyed by block id, then variety id.
 */
export const blockVarietyColors = memo((s) => {
  const perBlock = new Map<string, Map<string, number>>()
  for (const p of positions(s)) {
    const v = varietyAt(s, p)
    if (!v) continue
    const counts = perBlock.get(p.blockId) ?? new Map<string, number>()
    counts.set(v.id, (counts.get(v.id) ?? 0) + 1)
    perBlock.set(p.blockId, counts)
  }
  const out = new Map<string, Map<string, string>>()
  for (const [blockId, counts] of perBlock) {
    const ranked = [...counts.entries()].sort(
      ([a, na], [b, nb]) =>
        nb - na || (s.varieties[a]?.name ?? '').localeCompare(s.varieties[b]?.name ?? ''),
    )
    const m = new Map<string, string>()
    ranked.forEach(([id], i) => {
      const own = s.varieties[id]?.color
      m.set(id, own ?? (i < BLOCK_PALETTE.length ? BLOCK_PALETTE[i]! : GREY))
    })
    out.set(blockId, m)
  }
  return out
})

/** The color for a variety in a given block under "color by variety". */
export function blockVarietyColor(s: FarmState, blockId: string, varietyId: string): string {
  return blockVarietyColors(s).get(blockId)?.get(varietyId) ?? GREY
}

/** Where a variety stands: the coordinates of its positions, for fitting the map to it. */
export function coordsOfVarieties(s: FarmState, varietyIds: ReadonlySet<string>) {
  const out: [number, number][] = []
  for (const p of positions(s)) {
    const v = varietyAt(s, p)
    if (v && varietyIds.has(v.id)) out.push(p.coord)
  }
  return out
}
