/**
 * Seasonal tasks from the planner's task calendar (DESIGN.md §6): "Winter pruning, Pawpaw
 * Block 1, January to February". The planner knows when each labor item falls and how many
 * hours it takes; the field book turns that into Long Term items with a season, so next
 * winter's list starts itself.
 */
import type { Block, Target } from '@/model/types'
import type { PlannerCostItem, PlannerPlanting } from './compare'
import { basisDenominator, categoryFor, denominators, laborItems } from './compare'
import type { FarmState } from '@/model/types'
import { live } from '@/events/reduce'

export interface TaskDraft {
  /** Stable key, so a checkbox survives a re-render. */
  key: string
  title: string
  targets: Target[]
  category?: string
  season?: string
  seasonMonths: number[]
  estimatedMinutes?: number
  notes: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "January to February", "March", "November, January". */
export function monthPhrase(months: number[]): string {
  const sorted = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return MONTHS[sorted[0]! - 1]!
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1]! + 1)
  if (contiguous) return `${MONTHS[sorted[0]! - 1]} to ${MONTHS[sorted[sorted.length - 1]! - 1]}`
  return sorted.map((m) => MONTHS[m - 1]).join(', ')
}

/**
 * The planner's own fallback when an item has no timing, guessed from its label. Kept in
 * step with the planner's `defaultMonthsFor`.
 */
export function defaultMonths(item: PlannerCostItem): number[] {
  const label = item.label.toLowerCase()
  if (/winter prun|dormant/.test(label)) return [1, 2]
  if (/summer prun/.test(label)) return [6, 7]
  if (/prun/.test(label)) return [2, 3]
  if (/mow/.test(label)) return [5, 6, 7, 8, 9]
  if (/weed|herbicid/.test(label)) return [5, 6, 7]
  if (/fertiliz|compost/.test(label)) return [3, 4]
  if (/spray|pest|disease/.test(label)) return [5, 6, 7]
  if (/train|trellis|tie/.test(label)) return [6, 7]
  if (/thin/.test(label)) return [6]
  if (/plant/.test(label)) return [4]
  return []
}

/** Hours this item takes for the whole planting in a year. */
export function hoursForPlanting(item: PlannerCostItem, p: PlannerPlanting): number {
  const d = denominators(p)
  const denom = basisDenominator(item, d)
  if (denom === undefined) return 0
  return (item.quantity ?? 0) * denom
}

/** One draft per labor item that has a season, for a block and its planting. */
export function proposeSeedTasks(state: FarmState, p: PlannerPlanting, block: Block): TaskDraft[] {
  const timings = new Map((p.taskCalendar ?? []).map((t) => [t.costItemId, t.months]))
  const drafts: TaskDraft[] = []
  for (const item of laborItems(p)) {
    const months = timings.get(item.id) ?? defaultMonths(item)
    if (months.length === 0) continue
    const category = categoryFor(state, p.id, item)
    // Harvest schedules itself; the harvest window is not a task.
    if (category === 'harvest') continue
    const hours = hoursForPlanting(item, p)
    const season = monthPhrase(months)
    drafts.push({
      key: `${p.id}:${item.id}`,
      title: `${item.label}, ${block.name}`,
      targets: [{ kind: 'block', id: block.id }],
      ...(category ? { category } : {}),
      season,
      seasonMonths: [...new Set(months)].sort((a, b) => a - b),
      ...(hours > 0 ? { estimatedMinutes: Math.round(hours * 60) } : {}),
      notes: `From the plan: ${item.quantity ?? 0} ${item.basis === 'perAcre' ? 'hours an acre' : 'hours'}${hours > 0 ? `, about ${hours.toFixed(1)} hours for ${block.code}` : ''}.`,
    })
  }
  return drafts
}

/** Drafts for every linked block, skipping ones whose title is already on a list. */
export function proposeAll(
  state: FarmState,
  plantings: PlannerPlanting[],
): { drafts: TaskDraft[]; skipped: number } {
  const blocks = live.blocks(state)
  const existing = new Set(live.tasks(state).map((t) => t.title.trim().toLowerCase()))
  const drafts: TaskDraft[] = []
  let skipped = 0
  for (const p of plantings) {
    const block = blocks.find((b) => b.planner?.plantingId === p.id)
    if (!block) continue
    for (const d of proposeSeedTasks(state, p, block)) {
      if (existing.has(d.title.trim().toLowerCase())) skipped += 1
      else drafts.push(d)
    }
  }
  return { drafts, skipped }
}
