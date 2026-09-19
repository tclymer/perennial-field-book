/**
 * Work categories, aligned with the planner's labor cost items so the comparison is a straight
 * join (DESIGN.md §3.5). A farm can add its own; the strings are stored as given.
 */
export interface Category {
  id: string
  label: string
  /** Overhead categories are compared against the planner's overhead assumption, not a planting. */
  overhead?: boolean
}

export const CATEGORIES: readonly Category[] = [
  { id: 'pruning', label: 'Pruning' },
  { id: 'training', label: 'Trellising and training' },
  { id: 'fertilizing', label: 'Fertilizing' },
  { id: 'mowing', label: 'Mowing' },
  { id: 'weeding', label: 'Weeding' },
  { id: 'spraying', label: 'Spraying' },
  { id: 'watering', label: 'Watering' },
  { id: 'planting', label: 'Planting' },
  { id: 'grafting', label: 'Grafting' },
  { id: 'greenhouse', label: 'Greenhouse work' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'construction', label: 'Construction', overhead: true },
  { id: 'maintenance', label: 'Maintenance', overhead: true },
  { id: 'organization', label: 'Organization', overhead: true },
  { id: 'admin', label: 'Admin', overhead: true },
  { id: 'other', label: 'Other', overhead: true },
]

/** Categories that record materials by default (the organic input record). */
export const MATERIAL_CATEGORIES = new Set(['spraying', 'fertilizing'])

export function categoryLabel(id: string | undefined, extra: readonly string[] = []): string {
  if (!id) return ''
  const known = CATEGORIES.find((c) => c.id === id)
  if (known) return known.label
  return extra.find((c) => c === id) ?? id
}

/** Every category a farm can pick from: the standard list plus its own additions. */
export function allCategories(extra: readonly string[] = []): Category[] {
  return [...CATEGORIES, ...extra.map((label) => ({ id: label, label }))]
}
