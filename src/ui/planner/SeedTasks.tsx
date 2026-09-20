import { useMemo, useState } from 'react'
import { useFarmStore } from '@/state/store'
import { createTask } from '@/state/taskActions'
import { proposeAll } from '@/engine/seedTasks'
import type { PlannerPlanting } from '@/engine/compare'
import { categoryLabel } from '@/model/categories'
import { bucketName } from '@/engine/tasks'
import { Button, Card } from '@/ui/components'

/**
 * Turn the plan's task calendar into Long Term items with a season, reviewed before any are
 * created. Titles already on a list are left alone, so running it twice is harmless.
 */
export function SeedTasks({ plantings }: { plantings: PlannerPlanting[] }) {
  const state = useFarmStore((s) => s.state)
  const { drafts, skipped } = useMemo(() => proposeAll(state, plantings), [state, plantings])
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [created, setCreated] = useState<number | null>(null)
  const picked = chosen ?? new Set(drafts.map((d) => d.key))

  if (drafts.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold">Seasonal tasks from the plan</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {skipped > 0
            ? `All ${skipped} of the plan's seasonal jobs are already on a list.`
            : 'This plan carries no labor lines with a season.'}
        </p>
      </Card>
    )
  }

  const toggle = (key: string) => {
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChosen(next)
  }

  const create = () => {
    let n = 0
    for (const d of drafts) {
      if (!picked.has(d.key)) continue
      const { key, notes, ...fields } = d
      void key
      createTask({ ...fields, notes, bucket: 'later' })
      n += 1
    }
    setCreated(n)
    setChosen(new Set())
  }

  return (
    <Card>
      <h2 className="font-semibold">Seasonal tasks from the plan</h2>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Each labor line the plan schedules becomes a {bucketName(state.farm, 'later')} item with its
        months, so it surfaces when the season opens.
        {skipped > 0 && ` ${skipped} already on a list ${skipped === 1 ? 'was' : 'were'} skipped.`}
      </p>
      <ul className="mt-2 divide-y divide-stone-100 text-sm dark:divide-stone-800">
        {drafts.map((d) => (
          <li key={d.key} className="flex items-start gap-2 py-1.5">
            <input
              type="checkbox"
              className="mt-1"
              checked={picked.has(d.key)}
              aria-label={`Create ${d.title}`}
              onChange={() => toggle(d.key)}
            />
            <span className="min-w-0 flex-1">
              {d.title}
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                {d.season}
                {d.category && ` · ${categoryLabel(d.category, state.farm?.categories)}`}
                {d.estimatedMinutes ? ` · about ${(d.estimatedMinutes / 60).toFixed(1)} h` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={picked.size === 0} onClick={create}>
          Create {picked.size} {picked.size === 1 ? 'task' : 'tasks'}
        </Button>
        {created !== null && (
          <span role="status" className="text-sm text-lime-800 dark:text-lime-300">
            {created} created.
          </span>
        )}
      </div>
    </Card>
  )
}
