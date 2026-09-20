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

/**
 * The colour a fruit already has in your head. A map is read at a glance, so persimmons
 * being orange and figs purple does more work than any palette order can. A species not
 * listed falls back to the palette, skipping hues these have taken.
 */
export const SPECIES_DEFAULTS: Record<string, string> = {
  pawpaw: '#a3e635',
  persimmon: '#f97316',
  fig: '#a855f7',
  kiwi: '#16a34a',
  kiwiberry: '#16a34a',
  'kiwi berry': '#16a34a',
  hardy_kiwi: '#16a34a',
  jujube: '#b45309',
  apple: '#dc2626',
  crabapple: '#e11d48',
  pear: '#eab308',
  'asian pear': '#facc15',
  quince: '#facc15',
  medlar: '#a16207',
  peach: '#fb923c',
  nectarine: '#fb923c',
  apricot: '#f59e0b',
  plum: '#7e22ce',
  cherry: '#be123c',
  mulberry: '#6b21a8',
  elderberry: '#4c1d95',
  aronia: '#334155',
  chokeberry: '#334155',
  currant: '#1e293b',
  gooseberry: '#84cc16',
  grape: '#7c3aed',
  blueberry: '#3b82f6',
  raspberry: '#e11d48',
  blackberry: '#1f2937',
  strawberry: '#ef4444',
  goumi: '#ef4444',
  seaberry: '#fbbf24',
  'sea buckthorn': '#fbbf24',
  honeyberry: '#2563eb',
  haskap: '#2563eb',
  hazelnut: '#92400e',
  hazel: '#92400e',
  chestnut: '#78350f',
  walnut: '#57534e',
  heartnut: '#57534e',
  pecan: '#713f12',
  hickory: '#713f12',
  citrus: '#f59e0b',
  pomegranate: '#be123c',
  olive: '#4d7c0f',
}

/** The colour suggested for a crop by name, before anyone has chosen one. */
export function defaultSpeciesColor(species: string): string | undefined {
  const key = species.trim().toLowerCase()
  return (
    SPECIES_DEFAULTS[key] ??
    SPECIES_DEFAULTS[key.replace(/s$/, '')] ??
    SPECIES_DEFAULTS[key.replace(/\s+/g, '_')]
  )
}

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
  const taken = new Set<string>()
  // A colour chosen for the crop wins, then the colour the fruit already has, and only then
  // the palette. The palette skips what is already spoken for so two crops never match.
  const chosen = s.farm?.speciesColors ?? {}
  for (const [key, meta] of ordered) {
    const pick = chosen[key] ?? defaultSpeciesColor(meta.name)
    if (pick) {
      m.set(key, pick)
      taken.add(pick.toLowerCase())
    }
  }
  let next = 0
  for (const [key] of ordered) {
    if (m.has(key)) continue
    while (
      next < SPECIES_PALETTE.length * 2 &&
      taken.has(SPECIES_PALETTE[next % SPECIES_PALETTE.length]!.toLowerCase())
    ) {
      next += 1
    }
    const color = SPECIES_PALETTE[next % SPECIES_PALETTE.length]!
    m.set(key, color)
    taken.add(color.toLowerCase())
    next += 1
  }
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
