/** Units per crop (DESIGN.md §3.6): what the scale or the count says for one box. */
import type { FarmMeta } from './types'

export const DEFAULT_UNITS: Record<string, string> = {
  pawpaw: 'lb',
  persimmon: 'lb',
  kiwi: 'lb',
  kiwiberry: 'lb',
  'kiwi berry': 'lb',
  fig: 'half pint',
  jujube: 'lb',
  citrus: 'lb',
}

export const UNITS = ['lb', 'kg', 'half pint', 'pint', 'quart', 'each', 'bushel', 'flat']

/** Units that are counts rather than weights: the entry is typed as a whole number. */
export const COUNT_UNITS = new Set(['half pint', 'pint', 'quart', 'each', 'flat'])

export function cropKey(crop: string): string {
  return crop.trim().toLowerCase()
}

/**
 * The units a crop is measured in, the usual one first. A crop can have more than one: figs
 * are sold by the half pint but picked into bins that go on the scale, and apples are the
 * same story with bushels and pounds. Reports never add different units together, so keeping
 * both is safe.
 *
 * Older farms stored a single unit as a string; both shapes read the same way here, so no
 * saved farm needs converting.
 */
export function unitsFor(farm: FarmMeta | null | undefined, crop: string): string[] {
  const key = cropKey(crop)
  const set = farm?.units?.[key] ?? farm?.units?.[key.replace(/s$/, '')]
  const list = typeof set === 'string' ? [set] : (set ?? [])
  const cleaned = list.map((u) => u.trim()).filter(Boolean)
  if (cleaned.length) return [...new Set(cleaned)]
  const fallback = DEFAULT_UNITS[key] ?? DEFAULT_UNITS[key.replace(/s$/, '')] ?? 'lb'
  return [fallback]
}

/** The unit a crop is usually measured in: the first of its units. */
export function unitFor(farm: FarmMeta | null | undefined, crop: string): string {
  return unitsFor(farm, crop)[0]!
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(unit)
}
