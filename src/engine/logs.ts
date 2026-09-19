/** Work log arithmetic and export (DESIGN.md §3.4, §5). Allocation to plantings is later. */
import type { FarmState, Target, WorkLog } from '@/model/types'
import { categoryLabel } from '@/model/categories'
import { blockIdOfPosKey, positionByKey } from '@/state/derived'

/** Hours a log represents: duration times the number of people. */
export function hoursOf(log: WorkLog): number {
  if (!log.durationMinutes) return 0
  return (log.durationMinutes * Math.max(1, log.personIds.length)) / 60
}

export function targetLabel(state: FarmState, t: Target): string {
  switch (t.kind) {
    case 'farm':
      return 'Whole farm'
    case 'block': {
      const b = state.blocks[t.id]
      return b ? `${b.code} ${b.name}` : 'a block'
    }
    case 'row': {
      const r = state.rows[t.id]
      const b = r ? state.blocks[r.blockId] : undefined
      return r ? `${b?.code ?? ''} row ${r.number}`.trim() : 'a row'
    }
    case 'tree':
      return positionByKey(state).get(t.posKey)?.label ?? t.posKey
    case 'feature':
      return state.features[t.id]?.name ?? 'a place'
  }
}

/** The block a target belongs to, or undefined for the farm, a feature, or nothing. */
export function blockOfTarget(state: FarmState, t: Target): string | undefined {
  if (t.kind === 'block') return t.id
  if (t.kind === 'row') return state.rows[t.id]?.blockId
  if (t.kind === 'tree') return blockIdOfPosKey(state, t.posKey)
  return undefined
}

export type TotalsBy = 'category' | 'person' | 'month' | 'block'

export interface Total {
  key: string
  label: string
  hours: number
  count: number
}

/** Hours and log counts grouped one way, largest first. */
export function totals(state: FarmState, logs: readonly WorkLog[], by: TotalsBy): Total[] {
  const acc = new Map<string, Total>()
  const add = (key: string, label: string, hours: number) => {
    const t = acc.get(key) ?? { key, label, hours: 0, count: 0 }
    t.hours += hours
    t.count += 1
    acc.set(key, t)
  }
  for (const log of logs) {
    const hours = hoursOf(log)
    switch (by) {
      case 'category':
        add(
          log.category ?? '',
          categoryLabel(log.category, state.farm?.categories) || 'Uncategorized',
          hours,
        )
        break
      case 'month':
        add(log.date.slice(0, 7), log.date.slice(0, 7), hours)
        break
      case 'person':
        if (log.personIds.length === 0) add('', 'Nobody named', hours)
        for (const id of log.personIds) {
          add(id, state.people[id]?.name ?? 'Someone', hours / log.personIds.length)
        }
        break
      case 'block': {
        const blockId = log.targets.map((t) => blockOfTarget(state, t)).find(Boolean)
        if (blockId) {
          const b = state.blocks[blockId]
          add(blockId, b ? `${b.code} ${b.name}` : 'a block', hours)
        } else if (log.targets.some((t) => t.kind === 'farm')) add('farm', 'Whole farm', hours)
        else add('overhead', 'Overhead', hours)
        break
      }
    }
  }
  return [...acc.values()].sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label))
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per log, oldest first. */
export function logsToCsv(state: FarmState, logs: readonly WorkLog[]): string {
  const header = [
    'date',
    'people',
    'minutes',
    'hours',
    'category',
    'targets',
    'task',
    'materials',
    'notes',
  ]
  const rows = [...logs]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((l) =>
      [
        l.date,
        l.personIds.map((id) => state.people[id]?.name ?? id).join('; '),
        l.durationMinutes ?? '',
        hoursOf(l) ? hoursOf(l).toFixed(2) : '',
        categoryLabel(l.category, state.farm?.categories),
        l.targets.map((t) => targetLabel(state, t)).join('; '),
        l.taskId ? (state.tasks[l.taskId]?.title ?? '') : '',
        (l.materials ?? [])
          .map((m) =>
            [
              m.product,
              m.rate,
              m.amount !== undefined ? `${m.amount} ${m.unit ?? ''}`.trim() : '',
              m.lot ? `lot ${m.lot}` : '',
            ]
              .filter(Boolean)
              .join(' '),
          )
          .join('; '),
        l.notes ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n') + '\n'
}
