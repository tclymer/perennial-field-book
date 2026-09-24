/**
 * Traits on a variety (DESIGN.md §3.2): what a cultivar is like, in words the farm chooses.
 *
 * One namespace across the whole farm rather than a vocabulary per species. "Precocious" on a
 * persimmon and "precocious" on a pawpaw are the same trait, so filtering for it finds both,
 * and there is no list to set up before you can write anything down. The species-appropriate
 * feel comes from ordering the suggestions, not from partitioning the storage.
 */
import type { FarmState, Variety } from '@/model/types'
import { live } from '@/events/reduce'
import { currentTreeByPos, positionCountByVariety } from '@/state/derived'

/** Trim and collapse the whitespace. Case is kept as typed; matching ignores it. */
export function normalizeTrait(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function sameTrait(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * A trait may carry a value: "vigor: high" splits into a heading and a value, "precocious"
 * is just itself. Nothing requires the colon; it is there for when a comparison matters.
 */
export function splitTrait(trait: string): { key?: string; value: string } {
  const at = trait.indexOf(':')
  if (at < 0) return { value: trait.trim() }
  const key = trait.slice(0, at).trim()
  const value = trait.slice(at + 1).trim()
  return key && value ? { key, value } : { value: trait.trim() }
}

/** The traits on a variety, cleaned of blanks and repeats. */
export function traitsOf(v: Variety | undefined): string[] {
  const out: string[] = []
  for (const t of v?.traits ?? []) {
    const clean = normalizeTrait(t)
    if (clean && !out.some((x) => sameTrait(x, clean))) out.push(clean)
  }
  return out
}

export interface TraitUse {
  trait: string
  /** How many varieties carry it, across the farm. */
  count: number
  /** How many of those are of the species asked about. */
  inSpecies: number
}

function speciesKey(s: string): string {
  return s.trim().toLowerCase()
}

/** Every trait in use on the farm, with how often, most used first. */
export function traitsInUse(state: FarmState, species?: string): TraitUse[] {
  const want = species ? speciesKey(species) : null
  const by = new Map<string, TraitUse>()
  for (const v of live.varieties(state)) {
    const here = want !== null && speciesKey(v.species) === want
    for (const t of traitsOf(v)) {
      const k = t.toLowerCase()
      const row = by.get(k) ?? { trait: t, count: 0, inSpecies: 0 }
      row.count += 1
      if (here) row.inSpecies += 1
      by.set(k, row)
    }
  }
  return [...by.values()].sort(
    (a, b) => b.inSpecies - a.inSpecies || b.count - a.count || a.trait.localeCompare(b.trait),
  )
}

/**
 * What to offer while tagging one variety: what this species already uses first, then the
 * rest of the farm, leaving out what this variety already carries. The list builds itself as
 * the farm works, which is why there is nothing to configure.
 */
export function traitSuggestions(
  state: FarmState,
  species: string,
  already: readonly string[],
  limit = 12,
): string[] {
  return traitsInUse(state, species)
    .map((u) => u.trait)
    .filter((t) => !already.some((a) => sameTrait(a, t)))
    .slice(0, limit)
}

/** Varieties carrying a trait, for filtering the list. */
export function varietiesWithTrait(state: FarmState, trait: string): Variety[] {
  return live.varieties(state).filter((v) => traitsOf(v).some((t) => sameTrait(t, trait)))
}

/** Does any of this variety's traits contain the query? Used by the search box. */
export function traitMatches(v: Variety, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return traitsOf(v).some((t) => t.toLowerCase().includes(q))
}

export interface VarietyLine {
  species: string
  variety: string
  group: string
  traits: string
  source: string
  trees: number
  firstPlanted: string
  notes: string
}

/**
 * One line per variety: what it is, what it is like, where it came from, and how much of it
 * stands here. This is the sheet worth having, because traits nobody can get back out of the
 * app are just tidier notes.
 */
export function varietySheet(state: FarmState): VarietyLine[] {
  const counts = positionCountByVariety(state)
  const planted = new Map<string, string>()
  const byPos = currentTreeByPos(state)
  for (const t of byPos.values()) {
    if (!t.varietyId || !t.plantedDate) continue
    const best = planted.get(t.varietyId)
    if (!best || t.plantedDate < best) planted.set(t.varietyId, t.plantedDate)
  }
  return live
    .varieties(state)
    .map((v) => ({
      species: v.species,
      variety: v.name,
      group: v.group ?? '',
      traits: traitsOf(v).join('; '),
      source: v.source ?? '',
      trees: counts.get(v.id) ?? 0,
      firstPlanted: planted.get(v.id) ?? '',
      notes: v.notes ?? '',
    }))
    .sort((a, b) => a.species.localeCompare(b.species) || a.variety.localeCompare(b.variety))
}

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function varietySheetToCsv(rows: readonly VarietyLine[]): string {
  const header = [
    'species',
    'variety',
    'type',
    'traits',
    'source',
    'trees',
    'first planted',
    'notes',
  ]
  return [
    header.join(','),
    ...rows.map((r) =>
      [r.species, r.variety, r.group, r.traits, r.source, r.trees, r.firstPlanted, r.notes]
        .map(cell)
        .join(','),
    ),
  ].join('\n')
}
