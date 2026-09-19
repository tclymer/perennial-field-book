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

/** The farm's unit for a crop: its own setting, else the default, else pounds. */
export function unitFor(farm: FarmMeta | null | undefined, crop: string): string {
  const key = cropKey(crop)
  return farm?.units?.[key] ?? DEFAULT_UNITS[key] ?? DEFAULT_UNITS[key.replace(/s$/, '')] ?? 'lb'
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(unit)
}
