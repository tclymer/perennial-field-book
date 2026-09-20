/**
 * What is happening in each block right now, so the map answers an ordinary day's question
 * rather than only "where is this tree". Built from records the farm already keeps: open
 * tasks that point at a block, and what has been harvested from it this year.
 */
import type { FarmState, Task } from '@/model/types'
import { live } from '@/events/reduce'
import { blocksOfTarget } from '@/engine/logs'
import { blocksOfSpecies } from '@/engine/allocate'
import { dueState } from '@/engine/tasks'

export interface BlockActivity {
  /** Open tasks pointing at this block, most urgent first. */
  tasks: Task[]
  /** Recurring items here that are due or going stale. */
  due: number
  /** Harvested this year, in whatever unit the entries used. */
  harvest: { quantity: number; unit: string }[]
}

function blocksOfTask(state: FarmState, task: Task): string[] {
  const out = new Set<string>()
  for (const t of task.targets) {
    if (t.kind === 'species') for (const id of blocksOfSpecies(state, t.species)) out.add(id)
    else if (t.kind !== 'farm') for (const id of blocksOfTarget(state, t)) out.add(id)
  }
  return [...out]
}

/**
 * Per block. A task pointing at the whole farm is deliberately left out: it would light up
 * every block and tell you nothing.
 */
export function blockActivity(state: FarmState, today: string): Map<string, BlockActivity> {
  const out = new Map<string, BlockActivity>()
  const get = (id: string) => {
    const a = out.get(id) ?? { tasks: [], due: 0, harvest: [] }
    out.set(id, a)
    return a
  }
  const logs = live.logs(state)
  for (const task of live.tasks(state)) {
    if (task.done) continue
    const urgent =
      task.bucket === 'recurring' && ['due', 'stale'].includes(dueState(task, logs, today))
    if (task.bucket === 'recurring' && !urgent) continue
    for (const id of blocksOfTask(state, task)) {
      const a = get(id)
      a.tasks.push(task)
      if (urgent) a.due += 1
    }
  }
  const year = today.slice(0, 4)
  for (const h of live.harvests(state)) {
    if (!h.date.startsWith(year)) continue
    const id = h.blockId ?? (h.posKey ? blockOfPosKey(state, h.posKey) : undefined)
    if (!id) continue
    const a = get(id)
    const line = a.harvest.find((x) => x.unit === h.unit)
    if (line) line.quantity += h.quantity
    else a.harvest.push({ quantity: h.quantity, unit: h.unit })
  }
  for (const a of out.values()) {
    a.tasks.sort(
      (x, y) => Number(y.bucket === 'now') - Number(x.bucket === 'now') || x.order - y.order,
    )
  }
  return out
}

function blockOfPosKey(state: FarmState, posKey: string): string | undefined {
  const row = Object.values(state.rows).find((r) => posKey.startsWith(`${r.id}:`))
  if (row) return row.blockId
  return state.loosePositions[posKey]?.blockId
}

/** Pale to strong as the count rises; the top of the scale is whatever the busiest block has. */
export function heat(value: number, max: number, hue: 'amber' | 'lime'): string {
  if (value <= 0 || max <= 0) return '#d6d3d1'
  const steps =
    hue === 'amber'
      ? ['#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706']
      : ['#d9f99d', '#bef264', '#a3e635', '#84cc16', '#65a30d']
  const i = Math.min(steps.length - 1, Math.floor((value / max) * steps.length))
  return steps[i]!
}
